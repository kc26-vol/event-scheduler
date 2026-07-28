"""永続ストレージ (DATA_DIR) が使える状態かを起動時に検証する。

背景:
    Azure App Service (Linux) の /home は Azure Files (SMB) のネットワーク共有で、
    コンテナ起動直後はマウントが完了していないことがある。その状態のまま
    config.py の mkdir や main.py の create_all() まで進むと、アプリは
    「DBがまだ無い」と判断して *空のDBを新規作成* してしまう。
    本番ではこれが「DBが消えた」ように見える。

方針:
    永続ボリュームが確実に使えると確認できるまで待つ。確認できなければ
    空のDBを作らずに例外を投げてプロセスを落とす。gunicorn / App Service が
    コンテナを再起動し、マウント完了後に正常起動する。
    「起動しない」ほうが「空のDBで起動する」より遥かに安全という判断。

適用範囲:
    DATA_DIR を明示設定している場合のみ検証する (= 永続ストレージを使う意図がある)。
    DATA_DIR 未設定のローカル開発では何もしない。
    ボリュームが空で正当なケース (初回デプロイ・テスト) は
    ALLOW_EMPTY_DATA_DIR=1 で明示的に許可する。
"""
import os
import time
from pathlib import Path

# 一度でも正常起動できた永続ボリュームに置く目印。
# 次回以降はこれの有無で「正しいボリュームか」を判定できる。
MARKER_NAME = ".persistent-volume"
DB_NAME = "scheduler.db"


class PersistentStorageUnavailable(RuntimeError):
    """永続ボリュームを確認できなかった。空DBを作らずに起動を中止する。"""


def _probe_io(path: Path) -> None:
    """実際に読み書きして I/O が生きていることを確かめる。

    マウント済みでも SMB が不安定だと 'disk I/O error' になるため、
    存在チェックだけでは不十分。
    """
    probe = path / f".probe-{os.getpid()}"
    probe.write_text("ok", encoding="utf-8")
    try:
        if probe.read_text(encoding="utf-8") != "ok":
            raise OSError(f"probe の読み戻しが一致しません: {probe}")
    finally:
        try:
            probe.unlink()
        except OSError:
            pass


def _looks_mounted(path: Path) -> bool:
    """path がルートとは別デバイス上にあるか (= 別ボリュームがマウント済みか)。

    マウントに失敗するとコンテナのローカル層がそのまま見えてしまい、
    ルートと同じデバイスIDになる。それを検出する。
    """
    try:
        return os.stat(path).st_dev != os.stat("/").st_dev
    except OSError:
        return False


def _check_once(data_dir: Path, allow_empty: bool) -> tuple[bool, str]:
    """1回分の判定。(準備OKか, 理由) を返す。"""
    parent = data_dir.parent
    if not parent.is_dir():
        return False, f"親ディレクトリが存在しません: {parent}"

    # data_dir 自体はアプリが作る想定なので、無ければ親で I/O を確認する
    target = data_dir if data_dir.is_dir() else parent
    try:
        _probe_io(target)
    except OSError as e:
        return False, f"{target} への読み書きに失敗しました: {e}"

    # 「正しいボリュームである」ことの根拠を探す
    if (data_dir / MARKER_NAME).exists():
        return True, "マーカーを確認しました"
    if (data_dir / DB_NAME).exists():
        return True, f"{DB_NAME} を確認しました"
    if _looks_mounted(data_dir if data_dir.is_dir() else parent):
        return True, "別ボリュームへのマウントを確認しました"
    if allow_empty:
        return True, "ALLOW_EMPTY_DATA_DIR=1 のため空のボリュームを許可しました"

    return False, (
        f"{data_dir} が空で、マウント済みとも判定できません。"
        "共有が未マウントの可能性があるため、空DBの作成を中止します"
    )


def ensure_persistent_volume_ready(
    data_dir: Path,
    *,
    allow_empty: bool = False,
    attempts: int = 12,
    delay: float = 5.0,
    sleep=time.sleep,
    log=print,
) -> None:
    """永続ボリュームが使えるようになるまで待つ。だめなら例外を投げる。

    Args:
        data_dir: DATA_DIR
        allow_empty: 初回デプロイ時など、空のボリュームを許可する場合 True
        attempts: 試行回数 (既定 12 回 × 5 秒 = 最大約60秒待つ)
        delay: 試行間隔(秒)
    Raises:
        PersistentStorageUnavailable: 確認できなかった場合
    """
    data_dir = Path(data_dir)
    reason = "未実行"
    for i in range(1, attempts + 1):
        ok, reason = _check_once(data_dir, allow_empty)
        if ok:
            log(f"[storage] 永続ボリューム確認OK ({reason}): {data_dir}")
            _write_marker(data_dir, log=log)
            return
        log(f"[storage] 待機中 ({i}/{attempts}): {reason}")
        if i < attempts:
            sleep(delay)

    raise PersistentStorageUnavailable(
        f"永続ボリューム {data_dir} を確認できませんでした: {reason}. "
        "空のDBを作らないため起動を中止します。"
        "初回デプロイでボリュームが空の場合のみ ALLOW_EMPTY_DATA_DIR=1 を設定してください。"
    )


def _write_marker(data_dir: Path, log=print) -> None:
    """次回以降の判定用にマーカーを残す (既にあれば何もしない)。"""
    marker = data_dir / MARKER_NAME
    if marker.exists():
        return
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
        marker.write_text(
            "このファイルは永続ボリュームの目印です。削除しないでください。\n",
            encoding="utf-8",
        )
        log(f"[storage] マーカーを作成しました: {marker}")
    except OSError as e:
        # マーカーが書けなくても致命的ではない (DB有無で判定できる)
        log(f"[storage] マーカーを作成できませんでした: {e}")
