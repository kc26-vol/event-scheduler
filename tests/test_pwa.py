"""PWA (ホーム画面への追加 / オフライン) 周りのテスト。

守りたいのは「認証がインストールを壊さないこと」。
manifest とアイコンは、ブラウザが cookie を付けずに取りに来る。認証の内側に
置くとログイン画面への 302 が返り、manifest の解析に失敗して
「ホーム画面に追加」が出なくなる。手で試さないと気付けない壊れ方なので、
経路をここで固定しておく。
"""

import json
import re
from pathlib import Path

import pytest
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app.auth_middleware import AuthMiddleware
from app.http_cache import REVALIDATE, cache_control_for

ROOT = Path(__file__).resolve().parents[1]
SW_JS = ROOT / "frontend" / "public" / "sw.js"


# ---------------------------------------------------------------------------
# 認証の通し穴
# ---------------------------------------------------------------------------
@pytest.fixture
def anon(db):
    """認証ミドルウェアだけを載せた、cookie を持たないクライアント。

    db フィクスチャを取るのは、is_setup_complete() が app_settings を引くため。
    """
    async def ok(request):
        return PlainTextResponse("ok")

    app = Starlette(routes=[Route("/{path:path}", ok)])
    app.add_middleware(AuthMiddleware)
    # リダイレクトを追わない: 302 が返ったこと自体を見たい
    return TestClient(app, follow_redirects=False)


@pytest.mark.parametrize("path", [
    "/manifest.webmanifest",
    "/favicon.ico",
    "/icons/icon-192.png",
    "/icons/icon-maskable-512.png",
    "/icons/apple-touch-icon.png",
    # Service Worker 本体と precache 一覧。セッションが切れているあいだに
    # 更新確認が HTML を掴むと、更新が止まったままになる。
    "/sw.js",
    "/precache-manifest.js",
])
def test_PWAの資材は未認証でも取得できる(anon, path):
    assert anon.get(path).status_code == 200


@pytest.mark.parametrize("path", [
    "/",
    "/schedule",
    "/assets/index-abc123.js",
    "/uploads/photo.jpg",
])
def test_アプリ本体は未認証だとリダイレクトされる(anon, path):
    """通し穴を広げすぎていないこと。"""
    assert anon.get(path).status_code == 302


def test_APIは未認証だとリダイレクトではなくエラーを返す(anon):
    """SPA が 302 追跡でログイン HTML を JSON として読まないこと。"""
    assert anon.get("/api/staffs/").status_code in (401, 403)


def test_アイコンの通し穴は前方一致にしない(anon):
    """/icons/ を前方一致で通すと、SPA 配信のフォールバックで
    未認証のままアプリの殻 (index.html) を引けてしまう。
    """
    assert anon.get("/icons/does-not-exist.png").status_code == 302


# ---------------------------------------------------------------------------
# manifest
# ---------------------------------------------------------------------------
@pytest.fixture
def client():
    # app.main の import は起動処理 (マイグレーション・初期データ投入) を伴う。
    # 一時 DATA_DIR 上で走る (tests/conftest.py)。
    from app.main import app
    # コンテキストマネージャにしない = lifespan を走らせない。
    # バックアップのスケジューラをテストで動かす必要はない。
    return TestClient(app, follow_redirects=False)


def test_manifestが未認証で正しい形で返る(client):
    res = client.get("/manifest.webmanifest")
    assert res.status_code == 200
    # 拡張子が .webmanifest でも、この Content-Type でないと解析しないブラウザがある
    assert res.headers["content-type"].startswith("application/manifest+json")
    # アプリ名を変えたら次の起動で追いつくこと
    assert res.headers["cache-control"] == "no-cache"

    m = res.json()
    assert m["start_url"] == "/"
    assert m["scope"] == "/"
    assert m["display"] == "standalone"
    assert m["name"]
    # ホーム画面のラベルは 12 文字程度で切られる
    assert len(m["short_name"]) <= 12


@pytest.mark.parametrize("title, expected", [
    # 長いイベント名は単語の区切りで縮める。前から機械的に切ると
    # "KubeCon + Cl" になり、何のアプリか分からなくなる
    ("KubeCon + CloudNativeCon Japan 2026", "KubeCon"),
    ("PyCon JP 2026", "PyCon JP"),
    # 収まるものはそのまま
    ("短い名前", "短い名前"),
    ("A + B", "A + B"),
    # 空白で区切られない名前は前から切るしかない
    ("カンファレンス2026年夏", "カンファレンス2026年"),
    ("VeryLongSingleWordEventName", "VeryLongSing"),
])
def test_短い名前は単語の区切りで縮める(title, expected):
    from app.main import SHORT_NAME_MAX, _short_title

    assert _short_title(title) == expected
    assert len(_short_title(title)) <= SHORT_NAME_MAX


def test_manifestのアイコンは全て未認証で配れるようにしてある(client):
    """manifest に足したアイコンを認証の通し穴に入れ忘れないこと。

    忘れるとアイコンの取得がログイン画面へのリダイレクトになり、
    ホーム画面のアイコンが白いままになる。
    """
    from app.auth_middleware import PUBLIC_ICONS

    srcs = {i["src"] for i in client.get("/manifest.webmanifest").json()["icons"]}
    assert srcs <= PUBLIC_ICONS, f"通し穴に無い: {sorted(srcs - PUBLIC_ICONS)}"


def test_manifestのアイコンが実在し必要な用途を揃えている(client):
    icons = client.get("/manifest.webmanifest").json()["icons"]
    purposes = {i.get("purpose") for i in icons}
    # maskable が無いと Android でアイコンが白い枠に入る
    assert "maskable" in purposes
    assert "any" in purposes
    # 192 と 512 はインストール要件
    assert {"192x192", "512x512"} <= {i["sizes"] for i in icons}

    for icon in icons:
        assert (ROOT / "frontend" / "public" / icon["src"].lstrip("/")).is_file(), icon["src"]


def test_manifestのアプリ名はDBの設定を反映する(client):
    from app.database import SessionLocal
    from app.models import AppSetting

    db = SessionLocal()
    try:
        db.add(AppSetting(key="app_title", value="カンファレンス2026"))
        db.commit()
        assert client.get("/manifest.webmanifest").json()["name"] == "カンファレンス2026"
    finally:
        db.query(AppSetting).filter(AppSetting.key == "app_title").delete()
        db.commit()
        db.close()


# ---------------------------------------------------------------------------
# Service Worker
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("path", ["sw.js", "precache-manifest.js"])
def test_SWは毎回再検証させる(path):
    """ここが長期キャッシュになると、SW の更新が端末に届かなくなる。"""
    assert cache_control_for(path) == REVALIDATE


def _sw_data_paths() -> set[str]:
    """sw.js の DATA_PATHS を読み出す。"""
    src = SW_JS.read_text(encoding="utf-8")
    body = re.search(r"const DATA_PATHS = new Set\(\[(.*?)]\)", src, re.S)
    assert body, "sw.js の DATA_PATHS が見つからない"
    return set(re.findall(r"'([^']+)'", body.group(1)))


def test_オフラインで読める一覧がキャッシュ対象APIを網羅している():
    """app/api_cache.py に読み取り専用 API を足したら sw.js にも足すこと。

    足し忘れると、その画面だけオフラインで白くなる。オンラインでは何も
    起きないので、会場で初めて気付くことになる。
    """
    from app.api_cache import _CACHEABLE_PATHS

    missing = set(_CACHEABLE_PATHS) - _sw_data_paths()
    assert not missing, f"sw.js の DATA_PATHS に足りない: {sorted(missing)}"


def test_秘密を返すAPIはオフライン保存の対象にしない():
    """公開APIキーと GitHub トークンを端末のキャッシュに残さないこと。"""
    paths = _sw_data_paths()
    for secret_path in ("/api/public-api/settings", "/api/backup/auto/settings"):
        assert secret_path not in paths


def test_precache一覧はビルドで生成される():
    """public/ に手書きの precache-manifest.js を置いていないこと。

    置くとビルド出力に上書きされず (public/ の方が優先)、古いアセット一覧を
    precache し続ける。
    """
    assert not (ROOT / "frontend" / "public" / "precache-manifest.js").exists()


def test_ビルド済みのprecache一覧が実体と一致する():
    """dist があれば、precache する URL が実在すること。"""
    dist = ROOT / "frontend" / "dist"
    manifest = dist / "precache-manifest.js"
    if not manifest.is_file():
        pytest.skip("frontend/dist が未ビルド")

    src = manifest.read_text(encoding="utf-8")
    body = re.search(r"self\.__ES_PRECACHE = (\{.*})", src, re.S)
    assert body, "precache-manifest.js の形が変わっている"
    data = json.loads(body.group(1))
    assert data["version"]
    assert "/index.html" in data["urls"]
    for url in data["urls"]:
        assert (dist / url.lstrip("/")).is_file(), url
