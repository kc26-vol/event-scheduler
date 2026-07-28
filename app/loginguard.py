"""ログイン試行の記録を worker 間で共有する。

なぜ共有するのか
----------------
レート制限のバケットは worker ごとのメモリなので、そのままだと実効的な上限が
worker 数倍に緩む。共有パスワード1本で守っているアプリなので、ブルートフォース
耐性が4倍落ちるのは許容しづらい。

かといって worker 数で頭割りすると逆方向に壊れる。5回/分 ÷ 4 worker = 1回/分、
ロックアウト閾値 10回 ÷ 4 = 2回。パスワードを2回打ち間違えた利用者が
10分締め出されてしまう。

ログイン試行は頻度が低いので、共有ファイルで正確に数えれば両立できる。
(件数の多い /api/ 等は従来どおり worker ごとのメモリで十分。)

ファイルはローカルディスク (/tmp、app/proclock.py の管理下) に置く。
Azure Files ではないので1回あたりのコストは無視できる。
"""

import json
import os
import time
from pathlib import Path

from .proclock import ProcessLock, lock_dir

# レート制限: この秒数の窓で何回まで試行できるか (アプリ全体で)
ATTEMPT_WINDOW = 60
ATTEMPT_LIMIT = 5

# ロックアウト: 窓の中で規定回数失敗したら、一定時間締め出す
LOCKOUT_WINDOW = 300     # 5 minutes
LOCKOUT_THRESHOLD = 10   # failures within window
LOCKOUT_DURATION = 600   # 10 minutes

# 保持しておく必要のある最大期間。これを過ぎた記録は捨てる。
_RETENTION = LOCKOUT_WINDOW + LOCKOUT_DURATION

_lock = ProcessLock("login")


def _state_file() -> Path:
    return lock_dir() / "login_attempts.json"


def _load() -> dict:
    try:
        return json.loads(_state_file().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _save(state: dict):
    path = _state_file()
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state), encoding="utf-8")
    os.replace(tmp, path)


def _prune(state: dict, now: float) -> dict:
    """古い記録を落とす。放っておくと IP ごとに際限なく溜まるため。"""
    pruned = {}
    for ip, rec in state.items():
        attempts = [t for t in rec.get("attempts", []) if now - t < ATTEMPT_WINDOW]
        failures = [t for t in rec.get("failures", []) if now - t < _RETENTION]
        if attempts or failures:
            pruned[ip] = {"attempts": attempts, "failures": failures}
    return pruned


def _update(fn):
    """状態ファイルを読み込み → fn で更新 → 書き戻す、を worker 間で不可分に行う。

    ここはイベントループ上 (RateLimitMiddleware) からも呼ばれる。
    ロックを持つのは常にこの短い同期処理だけで、イベントループの再開を
    待つ処理を挟まないため、app/database.py で踏んだようなデッドロックは起きない。
    """
    now = time.time()
    with _lock:
        state = _prune(_load(), now)
        result = fn(state, now)
        _save(state)
    return result


def too_many_attempts(client_ip: str) -> bool:
    """試行を1回記録し、窓内の上限を超えていたら True。"""
    def apply(state, now):
        rec = state.setdefault(client_ip, {"attempts": [], "failures": []})
        rec["attempts"].append(now)
        return len(rec["attempts"]) > ATTEMPT_LIMIT

    return _update(apply)


def record_failure(client_ip: str):
    """ログイン失敗を記録する。"""
    def apply(state, now):
        rec = state.setdefault(client_ip, {"attempts": [], "failures": []})
        rec["failures"].append(now)

    _update(apply)


def is_locked(client_ip: str) -> bool:
    """失敗が続いて締め出し中かどうか。"""
    def apply(state, now):
        rec = state.get(client_ip)
        if not rec:
            return False
        recent = [t for t in rec["failures"] if now - t < LOCKOUT_WINDOW]
        if len(recent) < LOCKOUT_THRESHOLD:
            return False
        return now - recent[-1] < LOCKOUT_DURATION

    return _update(apply)


def clear(client_ip: str):
    """ログイン成功時に失敗の記録を消す (ロックアウトの解除)。

    試行回数のほうは消さない。あれは成否によらず「この IP からの
    /auth/verify の頻度」を抑えるためのもので、成功を挟めばリセットできると
    総当たりの抑止にならない。
    """
    def apply(state, now):
        rec = state.get(client_ip)
        if rec:
            rec["failures"] = []

    _update(apply)
