"""読み取り専用 API のキャッシュと無効化のテスト。

ここで守りたいのは速度ではなく「古い内容を配らないこと」。
キャッシュの取り違えは、配置を変更したのにスタッフの画面が変わらない、
という形で表に出る。
"""

import time

import pytest
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient

from app import api_cache
from app.api_cache import ApiCacheMiddleware


CACHEABLE = "/api/assignments/schedule"
NOT_CACHEABLE = "/api/settings/"


@pytest.fixture
def stub(monkeypatch):
    """DB を使わずに版番号を差し替えられるようにしたアプリ。"""
    state = {"version": 1, "payload": "A", "bumps": 0}

    def fake_read():
        return state["version"]

    def fake_bump():
        state["version"] += 1
        state["bumps"] += 1
        api_cache._memory.clear()
        return state["version"]

    monkeypatch.setattr(api_cache, "_read_version", fake_read)
    monkeypatch.setattr(api_cache, "bump_version", fake_bump)
    api_cache.invalidate()

    calls = {"n": 0}

    async def read_endpoint(request):
        calls["n"] += 1
        return JSONResponse({"value": state["payload"]})

    async def write_endpoint(request):
        state["payload"] = "B"
        return JSONResponse({"ok": True}, status_code=201)

    app = Starlette(routes=[
        Route(CACHEABLE, read_endpoint),
        Route(NOT_CACHEABLE, read_endpoint),
        Route("/api/assignments/", write_endpoint, methods=["POST"]),
    ])
    app.add_middleware(ApiCacheMiddleware)
    return TestClient(app), state, calls


def test_対象パスには_ETag_と_CacheControl_が付く(stub):
    client, _, _ = stub
    r = client.get(CACHEABLE)
    assert r.status_code == 200
    assert r.headers["etag"] == 'W/"v1"'
    assert "private" in r.headers["cache-control"]
    # 共有プロキシに載せない
    assert "public" not in r.headers["cache-control"]


def test_対象外パスには_ETag_が付かない(stub):
    client, _, _ = stub
    r = client.get(NOT_CACHEABLE)
    assert r.status_code == 200
    assert "etag" not in r.headers


def test_2回目はハンドラを呼ばずメモリから返す(stub):
    client, _, calls = stub
    first = client.get(CACHEABLE)
    assert calls["n"] == 1
    second = client.get(CACHEABLE)
    assert calls["n"] == 1, "キャッシュ命中時にハンドラが再実行されている"
    assert second.json() == first.json()


def test_同じ_ETag_なら304で本文を返さない(stub):
    client, _, _ = stub
    etag = client.get(CACHEABLE).headers["etag"]
    r = client.get(CACHEABLE, headers={"If-None-Match": etag})
    assert r.status_code == 304
    assert r.content == b""


def test_更新後は_ETag_が変わり新しい内容が返る(stub):
    client, _, _ = stub
    old_etag = client.get(CACHEABLE).headers["etag"]
    assert client.get(CACHEABLE).json() == {"value": "A"}

    assert client.post("/api/assignments/").status_code == 201

    r = client.get(CACHEABLE)
    assert r.headers["etag"] != old_etag
    assert r.json() == {"value": "B"}, "更新したのに古い内容が返っている"


def test_更新後は古い_ETag_で304にならない(stub):
    """これが崩れると、ブラウザが古い担当表を持ち続ける。"""
    client, _, _ = stub
    old_etag = client.get(CACHEABLE).headers["etag"]
    client.post("/api/assignments/")

    r = client.get(CACHEABLE, headers={"If-None-Match": old_etag})
    assert r.status_code == 200
    assert r.json() == {"value": "B"}


def test_失敗した更新では版番号を繰り上げない(monkeypatch):
    state = {"version": 5, "bumps": 0}
    monkeypatch.setattr(api_cache, "_read_version", lambda: state["version"])

    def fake_bump():
        state["bumps"] += 1
        return state["version"]

    monkeypatch.setattr(api_cache, "bump_version", fake_bump)
    api_cache.invalidate()

    async def failing(request):
        return JSONResponse({"detail": "no"}, status_code=400)

    app = Starlette(routes=[Route("/api/assignments/", failing, methods=["POST"])])
    app.add_middleware(ApiCacheMiddleware)
    client = TestClient(app)

    assert client.post("/api/assignments/").status_code == 400
    assert state["bumps"] == 0


def test_メモリキャッシュはTTLで作り直される(stub, monkeypatch):
    client, _, calls = stub
    client.get(CACHEABLE)
    assert calls["n"] == 1

    # 保持時間を過ぎた状態を作る
    monkeypatch.setattr(api_cache, "MEMORY_TTL_SECONDS", 0.0)
    client.get(CACHEABLE)
    assert calls["n"] == 2


def test_他の_worker_が繰り上げた版番号を即座に見る(db):
    """gunicorn の複数 worker 構成で「自分の更新が自分に見えない」を防ぐ。

    worker A が POST を処理して版番号を繰り上げたあと、同じ利用者の次の GET が
    worker B に届くことがある。B が版番号をプロセス内に覚えていると、
    B のメモリから更新前の内容を返してしまう。
    """
    from app.models import AppSetting

    api_cache.invalidate()
    db.add(AppSetting(key="data_version", value="100"))
    db.commit()
    assert api_cache._read_version() == 100

    # 別プロセス (worker A) が繰り上げた状況を、DB を直接書き換えて作る。
    # この worker は bump_version() を通っていない。
    row = db.query(AppSetting).filter(AppSetting.key == "data_version").first()
    row.value = "101"
    db.commit()

    assert api_cache._read_version() == 101, "他 worker の更新が見えていない"


def test_版番号は復元で巻き戻っても単調増加する(db):
    """バックアップ復元で data_version が巻き戻ると、過去に配ったのと同じ
    ETag が再利用され、中身が違うのに 304 を返してしまう。"""
    from app.models import AppSetting

    api_cache.invalidate()

    # 復元直後を模して、極端に小さい版番号を書き込む
    db.add(AppSetting(key="data_version", value="3"))
    db.commit()

    first = api_cache.bump_version()
    assert first > 3

    # 「過去に配った番号」より大きいことが要点 (時刻を下限にしている)
    assert first >= int(time.time())

    api_cache.invalidate()
    second = api_cache.bump_version()
    assert second > first
