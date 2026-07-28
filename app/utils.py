"""Shared utility functions used across routers."""

import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import UPLOAD_DIR
from .models import Staff, Session as SessionModel

ALLOWED_IMAGE_EXT = (".jpg", ".jpeg", ".png", ".gif", ".webp")


async def read_upload(photo: UploadFile) -> tuple[bytes, str]:
    """アップロードを検証して読み切り、(中身, 拡張子) を返す。

    DB セッションを持つ前に呼ぶこと。await を挟む処理をここに閉じ込めて、
    トランザクションを開いたままアップロードの読み込みを待つ状態を作らない。
    複数 worker 構成では、開きっぱなしのトランザクションが他 worker の
    書き込みを SQLite のロックで待たせてしまう。
    """
    ext = Path(photo.filename).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="対応していない画像形式です。jpg, png, gif, webp のみ対応しています。")
    return await photo.read(), ext


def store_upload(content: bytes, ext: str, prefix: str = "") -> str:
    """画像を新しいファイルとして保存し、URL パスを返す。

    ファイル名は毎回 UUID で、既存ファイルを上書きすることはない。
    この性質があるので /uploads は immutable としてキャッシュできる
    (app/http_cache.py を参照)。
    """
    filename = f"{prefix}{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / filename).write_bytes(content)
    return f"/uploads/{filename}"


def upload_path(url_path: str) -> Path:
    """"/uploads/xxx.jpg" のような URL パスを実ファイルのパスに変換する。

    以前は各所で Path("." + url_path) としていたが、これはカレントディレクトリ
    基準のパスになる。本番は CWD=/home/site/wwwroot、UPLOAD_DIR=/home/data/uploads
    なので両者が一致せず、削除は空振りし (画像が消えずに残る)、Excel 出力では
    写真が埋め込まれなかった。ローカル開発では DATA_DIR="." のため偶然一致して
    しまい、表に出にくい形になっていた。
    """
    return UPLOAD_DIR / Path(url_path).name


def remove_upload(url_path: str):
    """store_upload が返した URL パスのファイルを削除する。存在しなければ何もしない。"""
    if not url_path:
        return
    upload_path(url_path).unlink(missing_ok=True)


def is_staff_available(staff: Staff, session: SessionModel) -> bool:
    """スタッフの活動可能時間内にセッションが収まるかチェック"""
    if not staff.availabilities:
        return True  # 活動可能時間が未設定なら制約なし
    for avail in staff.availabilities:
        if avail.start_time <= session.start_time and avail.end_time >= session.end_time:
            return True
    return False
