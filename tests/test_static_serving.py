"""画像配信まわり (gzip スキップ / Cache-Control / レート制限) のテスト。"""

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse, Response
from starlette.routing import Route
from starlette.testclient import TestClient

from app.compression import SmartGZipMiddleware, is_compressible
from app.http_cache import IMMUTABLE, REVALIDATE, cache_control_for
from app.security import RateLimiter


# ---------------------------------------------------------------------------
# Content-Type 判定
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("content_type", [
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "font/woff2", "application/zip", "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg; charset=binary",
])
def test_圧縮済み形式は圧縮対象外(content_type):
    assert is_compressible(content_type) is False


@pytest.mark.parametrize("content_type", [
    "application/json", "text/html; charset=utf-8", "text/css",
    "application/javascript", "text/plain",
    # SVG / ICO は image/ 配下だが実体はテキストなので圧縮する
    "image/svg+xml", "image/x-icon",
    # 不明な場合はテキストの可能性があるので従来どおり圧縮
    "",
])
def test_テキスト系は圧縮対象(content_type):
    assert is_compressible(content_type) is True


# ---------------------------------------------------------------------------
# SmartGZipMiddleware
# ---------------------------------------------------------------------------
BODY = b"x" * 5000


def _client(body: bytes = BODY):
    async def jpeg(request):
        return Response(body, media_type="image/jpeg")

    async def text(request):
        return PlainTextResponse(body.decode())

    app = Starlette(routes=[Route("/jpeg", jpeg), Route("/text", text)])
    app.add_middleware(SmartGZipMiddleware, minimum_size=500, compresslevel=6)
    return TestClient(app)


def test_画像はgzipされず素通しされる():
    r = _client().get("/jpeg", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert "content-encoding" not in r.headers
    assert r.headers["content-length"] == str(len(BODY))


def test_テキストは従来どおりgzipされる():
    r = _client().get("/text", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200
    assert r.headers["content-encoding"] == "gzip"
    assert r.content == BODY  # httpx が展開した結果は元と一致する


def test_小さいレスポンスは圧縮されない():
    r = _client(b"tiny").get("/text", headers={"Accept-Encoding": "gzip"})
    assert "content-encoding" not in r.headers


def test_gzip非対応クライアントには素のまま返す():
    r = _client().get("/text", headers={"Accept-Encoding": "identity"})
    assert "content-encoding" not in r.headers
    assert r.content == BODY


# ---------------------------------------------------------------------------
# Cache-Control
# ---------------------------------------------------------------------------
def test_ハッシュ付きアセットは長期キャッシュ():
    assert cache_control_for("assets/index-a1b2c3d4.js") == IMMUTABLE


@pytest.mark.parametrize("path", ["index.html", "favicon.ico", "login.html"])
def test_html等は毎回再検証させる(path):
    assert cache_control_for(path) == REVALIDATE


# ---------------------------------------------------------------------------
# レート制限
# ---------------------------------------------------------------------------
def test_公開画像はデータAPIとは別枠で数える():
    """写真の多いページを開いてもデータ API の枠 (60/分) を食い潰さないこと。"""
    limiter = RateLimiter()
    limiter.add_rule("/public/api/", 60, 60, exclude_prefixes=("/public/api/photo/",))
    limiter.add_rule("/public/api/photo/", 600, 60)

    for i in range(100):
        assert limiter.is_limited(f"/public/api/photo/{i}.jpg", "1.2.3.4") is False

    # 画像を100枚取ったあとでもデータ API はまだ通る
    assert limiter.is_limited("/public/api/schedule", "1.2.3.4") is False


def test_データAPIの上限は従来どおり効く():
    limiter = RateLimiter()
    limiter.add_rule("/public/api/", 60, 60, exclude_prefixes=("/public/api/photo/",))

    for _ in range(60):
        assert limiter.is_limited("/public/api/schedule", "1.2.3.4") is False
    assert limiter.is_limited("/public/api/schedule", "1.2.3.4") is True


def test_除外指定なしのルールは従来どおり動く():
    limiter = RateLimiter()
    limiter.add_rule("/auth/verify", 5, 60)

    for _ in range(5):
        assert limiter.is_limited("/auth/verify", "1.2.3.4") is False
    assert limiter.is_limited("/auth/verify", "1.2.3.4") is True
