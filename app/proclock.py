"""gunicorn の worker プロセス間で使う排他ロック。

何に使っているか
----------------
SQLite が面倒を見てくれない、ファイル単位の read-modify-write に使う。

- 起動時の初期化 (app/main.py の _init_lock)
  CREATE TABLE や初期データ投入の「確認してから書く」を worker 間で不可分にする。
- バックアップの実行と backups/metadata.json の更新 (app/scheduler.py)
- スケジューラのリーダー選出 (try_acquire_leadership)
- ログイン試行の記録 (app/loginguard.py)

DB そのものの排他には**使っていない**。理由は app/database.py のコメントを参照。

守るべき不変条件
----------------
**ロックを持っている間に、イベントループの再開を待つ処理を挟まないこと。**

挟むとデッドロックする。DB のセッションがこれに当たった: threadpool 側が
ロックを持ったまま `Depends(get_db)` の後片付け (イベントループ経由) を待ち、
その間にイベントループ側が同じロックを待って止まり、互いに進めなくなった。

逆に、ロックの中が「ファイルを読んで書くだけ」のような短い同期処理で閉じて
いれば、イベントループ上から取っても安全 (loginguard がこれ)。
判断の軸はスレッドの種類ではなく、**ロック区間が自己完結しているか**。

どこにロックファイルを置くか
--------------------------
**ローカルディスク (/tmp)**。ロック対象は /home (Azure Files) にあるが、
ロックファイル自体をそこに置くと SMB のロック実装に依存してしまう。
gunicorn の worker は全員同じコンテナにいるので、ローカルディスク上の flock で
必要な排他が成立する。

(裏を返すと、これは複数インスタンスへのスケールアウトでは成立しない。
 App Service の worker_count を 2 以上にする場合は、この前提が崩れる。)
"""

import errno
import fcntl
import hashlib
import os
import tempfile
import threading
from pathlib import Path


def lock_dir() -> Path:
    """ロックファイルを置くローカルディスク上のディレクトリ。

    DATA_DIR ごとに分ける。テストが一時ディレクトリを使うので、
    同じホストで並行して走っても互いに干渉しない。

    worker 間で共有したい小さな状態ファイル (app/loginguard.py) も
    ここに置く。ローカルディスクなので読み書きのコストが無視できる。
    """
    key = hashlib.sha256(str(os.environ.get("DATA_DIR", ".")).encode()).hexdigest()[:12]
    d = Path(tempfile.gettempdir()) / f"event-scheduler-{key}"
    d.mkdir(parents=True, exist_ok=True)
    return d


class ProcessLock:
    """プロセス間で排他する再入可能ロック。

    - プロセス**間**: flock(LOCK_EX) で排他
    - プロセス**内**: threading.RLock + 参照カウント

    flock はプロセス単位 (正確には open file description 単位) なので、
    同一プロセス内の別スレッドは flock だけでは排他できない。
    スレッド間の排他は RLock が担い、flock は「最初に入ったスレッドが取り、
    最後に出たスレッドが離す」形にする。
    """

    def __init__(self, name: str):
        self.name = name
        self._path = lock_dir() / f"{name}.lock"
        self._guard = threading.RLock()
        self._depth = 0
        self._owner: int | None = None
        self._fd: int | None = None

    def acquire(self):
        self._guard.acquire()
        if self._depth == 0:
            try:
                self._flock_exclusive()
            except BaseException:
                self._guard.release()
                raise
            self._owner = threading.get_ident()
        self._depth += 1

    def release(self) -> bool:
        """acquire と対になっていない呼び出しは何もせず False を返す。

        保持していないスレッドから RLock を release すると RuntimeError に
        なり、本来の失敗理由を覆い隠してしまうため。
        """
        if self._owner != threading.get_ident():
            return False
        try:
            self._depth -= 1
            if self._depth == 0:
                self._owner = None
                self._funlock()
        finally:
            self._guard.release()
        return True

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *exc):
        self.release()
        return False

    # -- 内部 ------------------------------------------------------------
    def _flock_exclusive(self):
        fd = os.open(self._path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            try:
                # 競合していなければこれで即取れる (大半のケース)
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as e:
                if e.errno not in (errno.EACCES, errno.EAGAIN):
                    raise
                # 競合時はカーネルの待ち行列に入って待つ。
                #
                # ここを LOCK_NB のポーリングで待つと starvation が起きる。
                # ロックを持っているプロセスが解放した瞬間、同じプロセス内で
                # 待っていたスレッドが即座に取り直してしまい、別プロセスの
                # ポーラーはいつまでも空きを観測できない。
                # (3 worker で並行書き込みしたところ、30秒待っても取得できず
                #  worker が死んだ。ブロッキングにしたらこの問題は消えた)
                #
                # flock はブロック中に GIL を離すので、同一プロセス内の
                # 他スレッドは動き続けられる。
                fcntl.flock(fd, fcntl.LOCK_EX)
        except BaseException:
            os.close(fd)
            raise
        self._fd = fd

    def _funlock(self):
        if self._fd is None:
            return
        try:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
        finally:
            os.close(self._fd)
            self._fd = None


def try_acquire_leadership(name: str) -> "LeaderLock | None":
    """リーダー選出用。取れたら LeaderLock、取れなければ None を返す (待たない)。

    プロセスが死ねば OS が flock を解放するので、他の worker が引き継げる。
    """
    path = lock_dir() / f"{name}.leader"
    fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as e:
        os.close(fd)
        if e.errno in (errno.EACCES, errno.EAGAIN):
            return None
        raise
    os.write(fd, f"{os.getpid()}\n".encode())
    return LeaderLock(fd)


class LeaderLock:
    """try_acquire_leadership が返す、保持中のリーダー権。"""

    def __init__(self, fd: int):
        self._fd = fd

    def release(self):
        if self._fd is None:
            return
        try:
            fcntl.flock(self._fd, fcntl.LOCK_UN)
        finally:
            os.close(self._fd)
            self._fd = None
