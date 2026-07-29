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
# こちらも対象パス。ETag が資源ごとに分かれているかの比較に使う。
NOT_CACHEABLE_BUT_TAGGED = "/api/rooms/"
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
        Route(NOT_CACHEABLE_BUT_TAGGED, read_endpoint),
        Route(NOT_CACHEABLE, read_endpoint),
        Route("/api/assignments/", write_endpoint, methods=["POST"]),
    ])
    app.add_middleware(ApiCacheMiddleware)
    return TestClient(app), state, calls


def test_対象パスには_ETag_と_CacheControl_が付く(stub):
    client, _, _ = stub
    r = client.get(CACHEABLE)
    assert r.status_code == 200
    assert r.headers["etag"] == f'W/"{CACHEABLE}:v1"'
    assert "private" in r.headers["cache-control"]
    # 共有プロキシに載せない
    assert "public" not in r.headers["cache-control"]


def test_CacheControl_は設定値に従う(stub, monkeypatch):
    """既定は max-age=180。0 にすると毎回 ETag で検証する形になる。

    max-age 中は「読むだけの人への反映が遅れる」。これは許容した判断で、
    「編集した本人に見えない」ほうは frontend/src/store.ts が
    更新直後の取得に cache:'reload' を付けることで取り除いている。"""
    client, _, _ = stub

    monkeypatch.setattr(api_cache, "CACHE_SECONDS", 180)
    cc = client.get(CACHEABLE).headers["cache-control"]
    assert "max-age=180" in cc
    assert "private" in cc

    monkeypatch.setattr(api_cache, "CACHE_SECONDS", 0)
    cc = client.get(CACHEABLE).headers["cache-control"]
    assert "no-cache" in cc
    assert "max-age" not in cc


def test_ETag_は資源ごとに別物(stub):
    """版番号だけの ETag だと、別パスの検証子で 304 になってしまう。"""
    client, _, _ = stub
    etag_a = client.get(CACHEABLE).headers["etag"]
    etag_b = client.get(NOT_CACHEABLE_BUT_TAGGED).headers["etag"]
    assert etag_a != etag_b

    # 他パスの ETag では 304 にならない
    r = client.get(CACHEABLE, headers={"If-None-Match": etag_b})
    assert r.status_code == 200


def test_クエリ文字列付きはキャッシュしない(stub):
    """対象8本は今は引数を取らないが、あとで絞り込みが足されたときに
    「最初の1人の結果が全員に配られる」事故を防ぐ。"""
    client, _, calls = stub
    client.get(f"{CACHEABLE}?staff=1")
    n = calls["n"]
    client.get(f"{CACHEABLE}?staff=2")
    assert calls["n"] == n + 1, "クエリ違いでキャッシュが共有されている"


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


def test_版番号の繰り上げに失敗したらキャッシュ配信を止める(db, monkeypatch, caplog):
    """繰り上げに失敗すると DB の版番号が据え置かれる。そのまま動くと
    他 worker はメモリのまま、ブラウザは古い ETag のまま 304 を受け取り、
    「更新したのに反映されない」が延々続く。"""
    from app.models import AppSetting

    import app.database as database

    api_cache.invalidate()
    api_cache._degraded = False
    db.add(AppSetting(key="data_version", value="500"))
    db.commit()
    assert api_cache._read_version() == 500

    # 書き込みが必ず失敗する状況を作る。
    # _degraded はこの関数自身が書き換えるので monkeypatch では管理しない
    # (undo() で巻き戻され、検証したい状態が消えてしまう)。
    original = database.SessionLocal

    def exploding_session():
        raise RuntimeError("disk I/O error")

    database.SessionLocal = exploding_session
    try:
        with caplog.at_level("ERROR"):
            assert api_cache.bump_version() == 0
        assert "キャッシュ配信を停止" in caplog.text, "失敗が記録されていない"
    finally:
        database.SessionLocal = original

    # degraded 中は据え置きの版番号を使わない -> メモリ命中も 304 も起きない
    assert api_cache._degraded is True
    assert api_cache._read_version() != 500, "失敗後も据え置きの版番号を使っている"

    # 繰り上げが成功したら通常運転に戻る
    assert api_cache.bump_version() > 500
    assert api_cache._degraded is False
    assert api_cache._read_version() > 500


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
