"""Content-Type を見て圧縮を判断する gzip ミドルウェア。

Starlette の GZipMiddleware は Content-Type を一切見ないため、JPEG/PNG の
ような「すでに圧縮済み」のバイト列まで gzip にかけてしまう。しかも既定の
compresslevel は 9 (最も CPU を食う設定)。

画像は gzip してもほとんど縮まない (実測 0〜8%) 一方で、圧縮処理は
イベントループのスレッド上で同期的に走るため、worker 1 プロセス構成では
その間すべてのリクエストが止まる。実測で 842KB の JPEG 1枚あたり約 17ms。

ここでは Starlette の実装をそのまま流用しつつ、非圧縮対象の Content-Type
のときだけ「素通し」に切り替える。
"""

from starlette.datastructures import Headers
from starlette.middleware.gzip import GZipMiddleware, GZipResponder
from starlette.types import Message, Receive, Scope, Send

# すでに圧縮済み、または圧縮しても縮まない形式。
_SKIP_PREFIXES = ("image/", "video/", "audio/", "font/")
_SKIP_TYPES = frozenset({
    "application/zip",
    "application/gzip",
    "application/x-gzip",
    "application/octet-stream",
    "application/pdf",
    # xlsx (エクスポート機能の出力) は中身が zip
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
})
# プレフィックスは非圧縮側だが、実体はテキストなので圧縮したいもの。
_COMPRESS_ANYWAY = frozenset({"image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"})


def is_compressible(content_type: str) -> bool:
    """Content-Type ヘッダ値から gzip する価値があるかを判定する。"""
    # "image/jpeg; charset=..." のようなパラメータを落とす
    mime = content_type.split(";", 1)[0].strip().lower()
    if not mime:
        # 不明なら従来どおり圧縮する (テキストの可能性があるため)
        return True
    if mime in _COMPRESS_ANYWAY:
        return True
    if mime in _SKIP_TYPES:
        return False
    return not mime.startswith(_SKIP_PREFIXES)


class _ContentAwareGZipResponder(GZipResponder):
    async def send_with_gzip(self, message: Message) -> None:
        await super().send_with_gzip(message)
        if message["type"] == "http.response.start":
            content_type = Headers(raw=message["headers"]).get("content-type", "")
            if not is_compressible(content_type):
                # 親クラスは content_encoding_set が真のとき本文に手を触れない。
                # 「圧縮済みなので素通し」という既存の分岐に相乗りする。
                self.content_encoding_set = True


class SmartGZipMiddleware(GZipMiddleware):
    """GZipMiddleware と同じ使い方で、非圧縮向き Content-Type だけ素通しする。"""

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and "gzip" in Headers(scope=scope).get("Accept-Encoding", ""):
            responder = _ContentAwareGZipResponder(
                self.app, self.minimum_size, compresslevel=self.compresslevel
            )
            await responder(scope, receive, send)
            return
        await self.app(scope, receive, send)
