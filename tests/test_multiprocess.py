"""マルチ worker 構成の前提が本当に成り立つかを、実際に複数プロセスを立てて確かめる。

gunicorn の worker は独立したプロセスなので、スレッドで模しても意味がない
(GIL があるぶん本番より安全側に倒れてしまう)。ここでは multiprocessing で
本物のプロセスを起こして検証する。
"""

import json
import multiprocessing as mp
import os
import sys
import time
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# 子プロセス側で動く処理
#
# spawn 方式でも動くよう、モジュールのトップレベルに置く (子は import し直す)。
# 環境変数 DATA_DIR は親から引き継がれる。
# ---------------------------------------------------------------------------
def _bootstrap(data_dir: str):
    """子プロセス側で DATA_DIR を差し替えて app をロードできるようにする。"""
    os.environ["DATA_DIR"] = data_dir
    os.environ["ALLOW_EMPTY_DATA_DIR"] = "1"
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))


def _child_create_schema(data_dir):
    """テーブルを作る。親プロセスは conftest の DATA_DIR に固定されているため、
    対象の DATA_DIR を見られる子プロセスで実行する。"""
    _bootstrap(data_dir)
    from app.database import Base, engine
    from app import models  # noqa: F401  (テーブル定義の登録に必要)

    Base.metadata.create_all(bind=engine)
    return True


def _child_room_names(data_dir):
    """DB に入っている部屋名を全部返す。"""
    _bootstrap(data_dir)
    from app.database import SessionLocal
    from app.models import Room

    db = SessionLocal()
    try:
        return sorted(r.name for r in db.query(Room).all())
    finally:
        db.close()


def _child_boot_app(args):
    """app.main を import する = worker の起動処理を一通り走らせる。

    テーブル作成・マイグレーション・初期データ投入がここで動く。

    gunicorn は worker を一斉に fork するので、初期化も本当に同時に始まる。
    Pool.map だとプロセスごとに開始がずれて競合を取り逃すため、
    全員が揃うまで待ち合わせてから import する。
    """
    data_dir, barrier_dir, n_expected = args
    _bootstrap(data_dir)

    barrier = Path(barrier_dir)
    barrier.mkdir(parents=True, exist_ok=True)
    (barrier / str(os.getpid())).touch()
    deadline = time.monotonic() + 10
    while len(list(barrier.iterdir())) < n_expected and time.monotonic() < deadline:
        time.sleep(0.002)

    import app.main  # noqa: F401

    return True


def _child_seeded_counts(data_dir):
    """初期データの件数を返す。"""
    _bootstrap(data_dir)
    from app.database import SessionLocal
    from app.models import Category, SessionGroup

    db = SessionLocal()
    try:
        return {
            "categories": db.query(Category).count(),
            "session_groups": db.query(SessionGroup).count(),
        }
    finally:
        db.close()


def _child_hold_lock_and_count(args):
    """ロックを取り、共有カウンタを「読んで→待って→書く」で更新する。

    わざと非アトミックにしてあるので、排他できていなければ更新が失われる。
    """
    data_dir, counter_file, n = args
    _bootstrap(data_dir)
    from app.proclock import ProcessLock

    lock = ProcessLock("counter-test")
    path = Path(counter_file)
    for _ in range(n):
        with lock:
            current = int(path.read_text())
            time.sleep(0.001)  # read と write の隙間を広げて競合させる
            path.write_text(str(current + 1))
    return n


def _child_insert_rooms(args):
    """DB に部屋を n 件足す。複数プロセスから同時に呼ばれる。"""
    data_dir, n, tag = args
    _bootstrap(data_dir)
    from app.database import SessionLocal
    from app.models import Room

    inserted = 0
    for i in range(n):
        db = SessionLocal()
        try:
            db.add(Room(name=f"{tag}-{i}", capacity=10, floor=1))
            db.commit()
            inserted += 1
        finally:
            db.close()
    return inserted


def _child_try_leader(args):
    """リーダー権を取れるか試し、取れたら少し保持してから返す。"""
    data_dir, hold_seconds = args
    os.environ["DATA_DIR"] = data_dir
    os.environ["ALLOW_EMPTY_DATA_DIR"] = "1"
    sys.path.insert(0, str(REPO_ROOT))
    from app.proclock import try_acquire_leadership

    leader = try_acquire_leadership("scheduler")
    if leader is None:
        return False
    time.sleep(hold_seconds)
    leader.release()
    return True


def _child_append_metadata(args):
    """backup_lock を取って metadata.json に1件足す (read-modify-write)。"""
    data_dir, tag, n = args
    os.environ["DATA_DIR"] = data_dir
    os.environ["ALLOW_EMPTY_DATA_DIR"] = "1"
    sys.path.insert(0, str(REPO_ROOT))
    from app.scheduler import backup_lock, _read_metadata, _write_metadata

    for i in range(n):
        with backup_lock:
            entries = _read_metadata()
            entries.append({"id": f"{tag}-{i}", "created_at": f"2026-01-01T00:00:{i:02d}"})
            _write_metadata(entries)
    return n


# ---------------------------------------------------------------------------
# フィクスチャ
# ---------------------------------------------------------------------------
@pytest.fixture
def data_dir(tmp_path) -> str:
    """このテスト専用の DATA_DIR。子プロセスに渡す。"""
    d = tmp_path / "data"
    d.mkdir()
    (d / "backups").mkdir()
    return str(d)


@pytest.fixture
def pool():
    # fork だと親が持つ SQLAlchemy のコネクションや flock の fd を継承してしまい、
    # gunicorn の worker (fork だが exec 前に接続を張っていない) と条件が変わる。
    # spawn で素のプロセスから始める。
    ctx = mp.get_context("spawn")
    with ctx.Pool(processes=4) as p:
        yield p


# ---------------------------------------------------------------------------
# プロセス間ロックそのもの
# ---------------------------------------------------------------------------
def test_ロックが複数プロセスの更新を直列化する(data_dir, tmp_path, pool):
    """わざと非アトミックな read-modify-write を並行させ、更新が失われないこと。

    ロックを外すとこのテストは落ちる (= 排他が効いていることを実際に見ている)。
    """
    counter = tmp_path / "counter.txt"
    counter.write_text("0")

    n_proc, per_proc = 4, 15
    pool.map(
        _child_hold_lock_and_count,
        [(data_dir, str(counter), per_proc) for _ in range(n_proc)],
    )
    assert int(counter.read_text()) == n_proc * per_proc, "更新が失われている"


# ---------------------------------------------------------------------------
# 起動時の初期化
# ---------------------------------------------------------------------------
def test_全workerが同時に起動してもテーブル作成が競合しない(data_dir, tmp_path):
    """gunicorn は worker を一斉に立ち上げるので、初期化も同時に走る。

    ロックが無いと create_all の「存在確認 → CREATE TABLE」がプロセスを
    またいで割り込まれ、"table venue_maps already exists" で worker が
    起動に失敗する (実際に3 worker の gunicorn で再現した)。

    競合の検出は確率的なので、プロセスを多めに並べて窓を広げている。
    ロックが正しく効いていれば常に緑になる (失敗する方向にはブレない)。
    """
    n_proc = 8
    barrier = tmp_path / "boot-barrier"
    ctx = mp.get_context("spawn")
    with ctx.Pool(processes=n_proc) as p:
        results = p.map(_child_boot_app, [(data_dir, str(barrier), n_proc)] * n_proc)
        assert all(results), "起動に失敗した worker がある"
        counts = p.apply(_child_seeded_counts, (data_dir,))

    # 初期データが二重投入されていないこと
    assert counts["categories"] == 2, f"カテゴリが重複投入されている: {counts}"
    assert counts["session_groups"] == 1, f"セッショングループが重複投入されている: {counts}"



# ---------------------------------------------------------------------------
# DB の同時書き込み
# ---------------------------------------------------------------------------
def test_複数プロセスから同時に書いても全件残る(data_dir, pool):
    """4プロセス × 25件 を並行投入して、取りこぼしも例外も出ないことを見る。

    DB の同時アクセスは SQLite 自身のロックに任せている (app/database.py)。
    "database is locked" で書き込みが落ちないだけの busy timeout が
    設定されていることを、実プロセスで確かめる。
    """
    pool.apply(_child_create_schema, (data_dir,))

    n_proc, per_proc = 4, 25
    results = pool.map(
        _child_insert_rooms,
        [(data_dir, per_proc, f"p{i}") for i in range(n_proc)],
    )
    assert results == [per_proc] * n_proc, "書き込みに失敗したプロセスがある"

    names = pool.apply(_child_room_names, (data_dir,))
    # 名前が全部そろっている = 1件も取りこぼしていない
    assert names == sorted(
        f"p{i}-{j}" for i in range(n_proc) for j in range(per_proc)
    )


# ---------------------------------------------------------------------------
# リーダー選出
# ---------------------------------------------------------------------------
def test_リーダーになれるのは同時に1プロセスだけ(data_dir, pool):
    results = pool.map(_child_try_leader, [(data_dir, 1.0)] * 4)
    assert sum(results) == 1, f"リーダーが {sum(results)} プロセスいる (1のはず)"


def test_リーダーが抜けたら次のプロセスが取れる(data_dir, pool):
    # 1周目でリーダーになったプロセスは release して終了する
    first = pool.map(_child_try_leader, [(data_dir, 0.1)] * 4)
    assert sum(first) == 1
    # 2周目でも誰かが取れる = 前のリーダーの権利がちゃんと解放されている
    second = pool.map(_child_try_leader, [(data_dir, 0.1)] * 4)
    assert sum(second) == 1


# ---------------------------------------------------------------------------
# metadata.json の read-modify-write
# ---------------------------------------------------------------------------
def test_バックアップ履歴の同時更新で件数が失われない(data_dir, pool):
    n_proc, per_proc = 4, 10
    pool.map(
        _child_append_metadata,
        [(data_dir, f"p{i}", per_proc) for i in range(n_proc)],
    )
    entries = json.loads((Path(data_dir) / "backups" / "metadata.json").read_text())
    assert len(entries) == n_proc * per_proc, "更新が上書きで消えている"
    assert len({e["id"] for e in entries}) == n_proc * per_proc


# ---------------------------------------------------------------------------
# ログイン試行の記録 (worker 間で共有)
# ---------------------------------------------------------------------------
def _child_login_attempts(args):
    """n 回ログインを試行し、429 相当と判定された回数を返す。"""
    data_dir, n = args
    _bootstrap(data_dir)
    from app import loginguard

    return sum(loginguard.too_many_attempts("1.2.3.4") for _ in range(n))


def _child_login_failures(args):
    """n 回失敗を記録し、最後にロックアウト状態かを返す。"""
    data_dir, n = args
    _bootstrap(data_dir)
    from app import loginguard

    for _ in range(n):
        loginguard.record_failure("5.6.7.8")
    return loginguard.is_locked("5.6.7.8")


def test_ログイン試行の上限はworker数に関係なく一定(data_dir, pool):
    """worker ごとのメモリで数えると上限が worker 数倍に緩む。

    4プロセスで合計12回試行したら、上限5回を超えた7回が弾かれること。
    (頭割り方式だと逆に厳しくなりすぎ、正規利用者が締め出される)
    """
    n_proc, per_proc = 4, 3
    blocked = sum(pool.map(_child_login_attempts, [(data_dir, per_proc)] * n_proc))
    total = n_proc * per_proc
    from app.loginguard import ATTEMPT_LIMIT

    assert blocked == total - ATTEMPT_LIMIT, (
        f"{total}回中 {blocked}回 が弾かれた (期待 {total - ATTEMPT_LIMIT}回)"
    )


def test_ログイン失敗の記録がworkerをまたいで積算される(data_dir, pool):
    """1プロセスあたり3回でも、4プロセス合わせて閾値10回を超えたらロックされる。"""
    from app.loginguard import LOCKOUT_THRESHOLD

    results = pool.map(_child_login_failures, [(data_dir, 3)] * 4)
    assert 3 * 4 > LOCKOUT_THRESHOLD, "テストの前提 (合計が閾値を超える) が崩れている"
    assert any(results), "worker をまたいだ失敗が積算されていない"


def _child_login_success_then_limit(data_dir):
    """成功が続いても試行回数の上限は効き続けるか。"""
    _bootstrap(data_dir)
    from app import loginguard

    blocked = []
    for _ in range(8):
        limited = loginguard.too_many_attempts("9.9.9.9")
        if not limited:
            loginguard.clear("9.9.9.9")  # ログイン成功時の処理
        blocked.append(limited)
    return blocked


def test_ログイン成功しても試行回数はリセットされない(data_dir, pool):
    """成功でリセットされると、正解と不正解を交互に送るだけで上限を回避できてしまう。"""
    from app.loginguard import ATTEMPT_LIMIT

    blocked = pool.apply(_child_login_success_then_limit, (data_dir,))
    assert blocked[:ATTEMPT_LIMIT] == [False] * ATTEMPT_LIMIT, "上限内なのに弾かれた"
    assert all(blocked[ATTEMPT_LIMIT:]), "上限を超えたのに素通りしている"
