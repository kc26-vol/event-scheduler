"""読み取り専用 API のキャッシュ制御。

3段構えになっている。

1. **プロセス内キャッシュ** … 生成済みのレスポンス本文をメモリに持つ。
   DB アクセスと Pydantic の直列化を丸ごと省ける。
2. **ETag による条件付き GET** … 内容が変わっていなければ 304 を返し、
   本文を流さない。
3. **ブラウザキャッシュ (max-age)** … 往復そのものを省く。速いが、
   その間の変更は届かない (下記)。

## 無効化のしかた

データ全体に版番号 (data_version) を持ち、更新系リクエストが成功するたびに
繰り上げる。プロセス内キャッシュは版番号ごと保持しているので、繰り上がった
瞬間に全エントリが参照されなくなる。ETag も版番号から作るため、ブラウザ側の
条件付き GET も同時に外れる。

    1回目: GET /api/assignments/schedule    -> 200 + ETag: "v42"  (生成してメモリへ)
    2回目: If-None-Match: "v42"             -> 304 (本文なし)
    配置変更 (POST/PUT/DELETE)               -> 版番号 42 -> 43、メモリ破棄
    次の GET:                                -> 200 + ETag: "v43" (再生成)

gunicorn を複数 worker で動かす場合、メモリキャッシュは worker ごとに
独立するが、版番号は DB にあるため無効化は全 worker に伝わる。
伝播の遅れは最大 _VERSION_TTL 秒。

## max-age だけに頼らない理由

`max-age` は「その間サーバーへ問い合わせない」という意味で、サーバーから
取り消す方法がない。配置を変更してもスタッフ側には古い担当が見え続け、
担当者がシフトに現れないという形で失敗する。上の 1 と 2 は正しさを
損なわずに効くので、まずそちらで速くしている。

API_CACHE_SECONDS に 0 を入れると max-age を外し、毎回 ETag で検証する
(常に最新。往復は残るが本文は流れない)。当日の入れ替えが多い時間帯に
即時反映させたい場合はこちら。

## private を付ける理由

これらは共通パスワード認証の内側にある。共有プロキシや CDN に載ると
未認証の相手へ配られる可能性があるため、ブラウザ内に閉じさせる。
"""

import os
import time
from dataclasses import dataclass

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_DEFAULT_SECONDS = 300  # 5分

# ブラウザに許す max-age。0 なら毎回 ETag で検証する。
try:
    CACHE_SECONDS = int(os.environ.get("API_CACHE_SECONDS", str(_DEFAULT_SECONDS)))
except ValueError:
    CACHE_SECONDS = _DEFAULT_SECONDS

# プロセス内キャッシュの保持時間。版番号で無効化されるので正しさには
# 影響しない (使わなくなったエントリを抱え続けないための上限)。
MEMORY_TTL_SECONDS = _DEFAULT_SECONDS

# キャッシュと ETag の対象パス
_CACHEABLE_PATHS = frozenset({
    "/api/rooms/",
    "/api/sessions/",
    "/api/staffs/",
    "/api/categories/",
    "/api/session-groups/",
    "/api/venue-maps/",
    "/api/assignments/schedule",
    "/api/assignments/staff-schedule",
})

# 更新系で版番号を繰り上げる範囲。
#
# 除外リストは作らない。/api/export/restore のようにデータを丸ごと
# 入れ替えるものを見落とすと、古い内容を配り続ける事故になる。
# 逆に無関係な更新で繰り上げても、次の GET が1回作り直されるだけで害がない。
# 「安全側に倒して全部繰り上げる」を既定にしている。
_VERSION_BUMP_PREFIX = "/api/"

_SETTING_KEY = "data_version"

# 版番号の読み出しはリクエストごとに走るので、ごく短時間だけ覚えておく。
_VERSION_TTL = 1.0
_cached_version: tuple[int, float] = (0, 0.0)


@dataclass
class _Entry:
    version: int
    body: bytes
    media_type: str
    stored_at: float


# path -> 生成済みレスポンス
_memory: dict[str, _Entry] = {}


def _read_version() -> int:
    """現在のデータ版番号を返す (無ければ 0)。"""
    global _cached_version
    value, ts = _cached_version
    now = time.monotonic()
    if now - ts < _VERSION_TTL:
        return value

    from .database import SessionLocal
    from .models import AppSetting

    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter(AppSetting.key == _SETTING_KEY).first()
        value = int(row.value) if row and str(row.value).isdigit() else 0
    except Exception:
        # 版番号が読めないときは「毎回変わった」ことにして正しさを優先する
        value = int(time.time())
    finally:
        db.close()

    _cached_version = (value, now)
    return value


def bump_version() -> int:
    """データ版番号を繰り上げ、プロセス内キャッシュを捨てる。"""
    global _cached_version

    from .database import SessionLocal
    from .models import AppSetting

    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter(AppSetting.key == _SETTING_KEY).first()
        current = int(row.value) if row and str(row.value).isdigit() else 0
        # 単調増加させる。バックアップから復元すると版番号も巻き戻るため、
        # +1 だけだと過去に配ったのと同じ ETag を再利用してしまい、
        # 中身が違うのに 304 を返す事故が起きる。時刻を下限に噛ませて
        # 「一度使った番号には戻らない」ことを保証する。
        nxt = max(current + 1, int(time.time()))
        if row:
            row.value = str(nxt)
        else:
            db.add(AppSetting(key=_SETTING_KEY, value=str(nxt)))
        db.commit()
    except Exception:
        db.rollback()
        nxt = 0
    finally:
        db.close()

    _memory.clear()
    # 次の読み出しで DB から取り直させる
    _cached_version = (0, 0.0)
    return nxt


def current_version() -> int:
    return _read_version()


def invalidate() -> None:
    """テストや管理操作から明示的にキャッシュを捨てる。"""
    global _cached_version
    _memory.clear()
    _cached_version = (0, 0.0)


def _cache_control() -> str:
    if CACHE_SECONDS > 0:
        return f"private, max-age={CACHE_SECONDS}, must-revalidate"
    # no-cache = 「持っていてよいが、使う前に必ず検証しろ」(no-store とは違う)
    return "private, no-cache, must-revalidate"


def _headers(etag: str) -> dict[str, str]:
    return {
        "ETag": etag,
        "Cache-Control": _cache_control(),
        "Vary": "Accept-Encoding, Cookie",
    }


class ApiCacheMiddleware(BaseHTTPMiddleware):
    """読み取り専用 API をプロセス内にキャッシュし、ETag で条件付き GET にする。

    gzip より内側に置くこと。ここで持つのは非圧縮の本文で、圧縮は外側の
    SmartGZipMiddleware が担当する (Accept-Encoding ごとに別物を持たずに済む)。
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        # --- 更新系: 成功したら版番号を繰り上げてキャッシュを捨てる ---
        if method in ("POST", "PUT", "PATCH", "DELETE"):
            response = await call_next(request)
            if 200 <= response.status_code < 300 and path.startswith(_VERSION_BUMP_PREFIX):
                bump_version()
            return response

        if method != "GET" or path not in _CACHEABLE_PATHS:
            return await call_next(request)

        version = _read_version()
        etag = f'W/"v{version}"'

        # --- 変わっていなければ本文を流さない ---
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=_headers(etag))

        # --- プロセス内キャッシュ ---
        hit = _memory.get(path)
        if (
            hit is not None
            and hit.version == version
            and time.monotonic() - hit.stored_at < MEMORY_TTL_SECONDS
        ):
            return Response(content=hit.body, media_type=hit.media_type, headers=_headers(etag))

        response = await call_next(request)
        if response.status_code != 200:
            return response

        # BaseHTTPMiddleware は StreamingResponse を渡してくるので、
        # 保存するには一度読み切る必要がある。
        body = b"".join([chunk async for chunk in response.body_iterator])
        media_type = response.headers.get("content-type", "application/json")
        _memory[path] = _Entry(
            version=version, body=body, media_type=media_type, stored_at=time.monotonic()
        )
        return Response(content=body, media_type=media_type, headers=_headers(etag))
