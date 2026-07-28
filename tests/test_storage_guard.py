"""永続ボリューム検証 (app/storage_guard.py) のテスト。

本番障害の再現: /home が未マウントのまま起動すると空のDBが作られてしまう。
このガードが「空DBを作らせない」ことを確認する。
"""
import pytest

from app.storage_guard import (
    DB_NAME,
    MARKER_NAME,
    PersistentStorageUnavailable,
    ensure_persistent_volume_ready,
)


def _silent(*_args, **_kwargs):
    """テスト中はログもsleepも黙らせる"""


def _run(data_dir, **kw):
    kw.setdefault("sleep", _silent)
    kw.setdefault("log", _silent)
    return ensure_persistent_volume_ready(data_dir, **kw)


# --- 正常に起動してよいケース -------------------------------------------------

def test_マーカーがあれば起動できる(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    (d / MARKER_NAME).write_text("x", encoding="utf-8")
    _run(d)  # 例外が出なければOK


def test_既存DBがあれば起動できる(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    (d / DB_NAME).write_bytes(b"sqlite")
    _run(d)


def test_初回デプロイは明示フラグで許可できる(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    _run(d, allow_empty=True)
    # 次回以降のためにマーカーが残る
    assert (d / MARKER_NAME).exists()


def test_起動できたらマーカーが作られる(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    (d / DB_NAME).write_bytes(b"sqlite")
    _run(d)
    assert (d / MARKER_NAME).exists()


# --- 起動を止めなければならないケース ----------------------------------------

def test_空ディレクトリでは起動を中止する(tmp_path):
    """未マウントで空に見える状態。ここで空DBを作らせないことが最重要。"""
    d = tmp_path / "data"
    d.mkdir()
    with pytest.raises(PersistentStorageUnavailable):
        _run(d, attempts=2, delay=0)


def test_親ディレクトリが無ければ起動を中止する(tmp_path):
    """/home ごと見えていない状態"""
    d = tmp_path / "missing" / "data"
    with pytest.raises(PersistentStorageUnavailable):
        _run(d, attempts=2, delay=0)


def test_中止時にDBファイルを作らない(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    with pytest.raises(PersistentStorageUnavailable):
        _run(d, attempts=2, delay=0)
    assert not (d / DB_NAME).exists()
    assert list(d.iterdir()) == []  # probe も後始末されている


def test_書き込めない場合は起動を中止する(tmp_path):
    """マウントはされているが SMB が I/O エラーを返す状態"""
    d = tmp_path / "data"
    d.mkdir()
    (d / MARKER_NAME).write_text("x", encoding="utf-8")
    d.chmod(0o500)  # 読み取り専用
    try:
        with pytest.raises(PersistentStorageUnavailable):
            _run(d, attempts=2, delay=0)
    finally:
        d.chmod(0o700)


# --- 遅れてマウントされるケース ----------------------------------------------

def test_遅れてマウントされたら起動できる(tmp_path):
    """コンテナ起動直後はまだ共有が見えず、数秒後に見えるパターン"""
    d = tmp_path / "data"
    d.mkdir()
    calls = {"n": 0}

    def fake_sleep(_seconds):
        calls["n"] += 1
        if calls["n"] == 2:  # 2回目の待機後にマウントされたことにする
            (d / DB_NAME).write_bytes(b"sqlite")

    _run(d, attempts=5, delay=0, sleep=fake_sleep)
    assert (d / MARKER_NAME).exists()


def test_試行回数を使い切ったら中止する(tmp_path):
    d = tmp_path / "data"
    d.mkdir()
    calls = {"n": 0}

    def counting_sleep(_seconds):
        calls["n"] += 1

    with pytest.raises(PersistentStorageUnavailable):
        _run(d, attempts=3, delay=0, sleep=counting_sleep)
    assert calls["n"] == 2  # 最終試行の後は待たない
