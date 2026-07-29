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

## max-age を既定で 0 にしている理由

`max-age` を入れると、その間ブラウザはサーバーへ問い合わせない。これは
サーバー側から取り消せないので、1 と 2 の無効化が一切届かなくなる。

実際に 300 秒で試したところ、**自分の更新が自分に見えなくなった**。
SPA は更新後に同じ URL を取り直すため (frontend/src/store.ts の
addAssignment -> loadSchedule)、ブラウザは新鮮なキャッシュをそのまま返す:

    POST /api/assignments/        -> 201 (サーバー側は正しく反映)
    GET  /api/assignments/schedule -> ブラウザキャッシュから配置前の内容
    実測: 配置 940 件 -> POST 成功 -> 再取得しても 940 件のまま

RFC 9111 §4.4 では、更新系が無効化するのは「そのリクエスト先の URI」だけ。
POST /api/assignments/ は GET /api/assignments/schedule を無効化しない。

1 と 2 は正しさを損なわずに効く (実測 48ms -> 1.5ms) ので、既定では
max-age を使わず毎回 ETag で検証する。往復は残るが本文は流れない。

API_CACHE_SECONDS に秒数を入れれば max-age を付けられる。ただし上記の
とおり編集フローが壊れるので、入れるなら更新がほぼ起きない資源に限る。

## private を付ける理由

これらは共通パスワード認証の内側にある。共有プロキシや CDN に載ると
未認証の相手へ配られる可能性があるため、ブラウザ内に閉じさせる。
"""

import logging
import os
import time
from dataclasses import dataclass

from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# ブラウザに許す max-age。既定 0 = 毎回 ETag で検証する (上の説明を参照)。
try:
    CACHE_SECONDS = int(os.environ.get("API_CACHE_SECONDS", "0"))
except ValueError:
    CACHE_SECONDS = 0

# プロセス内キャッシュの保持時間。版番号で無効化されるので正しさには
# 影響しない (使わなくなったエントリを抱え続けないための上限)。
MEMORY_TTL_SECONDS = 300.0

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

# 版番号はリクエストごとに DB から読む。プロセス内に短時間キャッシュすると、
# gunicorn の複数 worker 構成で「自分の更新が自分に見えない」ことがある:
#
#   worker A が POST を処理 -> 版番号を繰り上げて A のメモリを破棄
#   同じ利用者の次の GET が worker B に届く
#   -> B が古い版番号を覚えていると、B のメモリから更新前の内容を返す
#
# 実測で 1回 0.18ms (対して schedule の生成は 39ms) なので、
# ここを削ってでも「更新したら次に必ず見える」を優先する。


@dataclass
class _Entry:
    version: int
    body: bytes
    media_type: str
    stored_at: float


# path -> 生成済みレスポンス
_memory: dict[str, _Entry] = {}


# 版番号の繰り上げに失敗した worker は、キャッシュを配るのをやめる。
# 失敗すると DB の版番号が据え置かれるため、そのまま動くと「更新したのに
# 古い内容を配り続ける」になる。次に繰り上げが成功したら解除する。
_degraded = False


def _read_version() -> int:
    """現在のデータ版番号を返す (無ければ 0)。"""
    if _degraded:
        # 毎回違う値にして、メモリ命中も 304 も起こさせない
        return int(time.time())

    from .database import SessionLocal
    from .models import AppSetting

    db = None
    try:
        db = SessionLocal()
        row = db.query(AppSetting).filter(AppSetting.key == _SETTING_KEY).first()
        return int(row.value) if row and str(row.value).isdigit() else 0
    except Exception:
        # 版番号が読めないときは「毎回変わった」ことにして正しさを優先する。
        # キャッシュが効かなくなるだけで、古い内容は配らない。
        logger.warning("[api_cache] 版番号を読めませんでした。今回はキャッシュを使いません。", exc_info=True)
        return int(time.time())
    finally:
        if db is not None:
            db.close()


_BUMP_ATTEMPTS = 3


def bump_version() -> int:
    """データ版番号を繰り上げ、プロセス内キャッシュを捨てる。

    失敗したときは黙って戻らないこと。DB の版番号が据え置かれると、
    他の worker はメモリのまま、ブラウザは古い ETag のまま 304 を受け取り、
    「更新したのに反映されない」が延々続く。SQLite の書き込みロック競合は
    起こりうるので数回試し、それでも駄目なら degraded に落として
    この worker はキャッシュを配らないようにする。
    """
    global _degraded

    from .database import SessionLocal
    from .models import AppSetting

    last_error: Exception | None = None
    for attempt in range(_BUMP_ATTEMPTS):
        # SessionLocal() 自体も失敗しうる (コネクション枯渇など) ので try の中で作る。
        # ここで例外が漏れると、成功した更新が 500 になって返る。
        db = None
        try:
            db = SessionLocal()
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
            _memory.clear()
            _degraded = False
            return nxt
        except Exception as e:  # noqa: BLE001 - 失敗種別によらず退避したい
            last_error = e
            if db is not None:
                db.rollback()
        finally:
            if db is not None:
                db.close()

    _memory.clear()
    _degraded = True
    logger.error(
        "[api_cache] 版番号を %d 回試しても繰り上げられませんでした。"
        "この worker はキャッシュ配信を停止します (古い内容を配らないため)。",
        _BUMP_ATTEMPTS,
        exc_info=last_error,
    )
    return 0


def current_version() -> int:
    return _read_version()


def invalidate() -> None:
    """テストや管理操作から明示的にキャッシュを捨てる。"""
    _memory.clear()


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
                # DB アクセスはイベントループ上で直接やらない。app/database.py に
                # あるとおり、この構成では Depends(get_db) の後片付けと
                # かち合って worker ごと停止したことがある。
                await run_in_threadpool(bump_version)
            return response

        if method != "GET" or path not in _CACHEABLE_PATHS:
            return await call_next(request)

        # クエリ文字列があるものはキャッシュしない。
        # 対象の8本は今どれも引数を取らないが、あとで絞り込みが足された際に
        # 「最初の1人が引いた結果が全員に配られる」事故を防ぐための保険。
        if request.url.query:
            return await call_next(request)

        version = await run_in_threadpool(_read_version)
        # ETag は資源ごとに別物にする (RFC 9110 §8.8.3)。版番号だけだと
        # /api/rooms/ の検証子で /api/staffs/ が 304 になる。
        etag = f'W/"{path}:v{version}"'

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

        # version は本文を作る前に読んだ値。生成中に更新が入った場合、
        # 「新しい本文を古い版番号で保存する」ことになるが、次の読み出しでは
        # DB 側が新しい版番号を返して不一致になり作り直される。
        # 逆向き (古い本文を新しい版番号で保存) は起きないので、
        # 古い内容を配り続けることはない。
        _memory[path] = _Entry(
            version=version, body=body, media_type=media_type, stored_at=time.monotonic()
        )
        # background は元の応答から引き継ぐ (キャッシュ命中時は本来走らないので
        # ここだけ。現状この経路に background を持つルートは無い)。
        return Response(
            content=body,
            media_type=media_type,
            headers=_headers(etag),
            background=response.background,
        )
