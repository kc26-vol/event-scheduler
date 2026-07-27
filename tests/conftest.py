"""テスト用の共通フィクスチャ。

app.config が import 時に DATA_DIR を読むため、app パッケージを import する前に
一時ディレクトリを環境変数へ設定する。
"""
import os
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

_TMP = tempfile.mkdtemp(prefix="event-scheduler-tests-")
os.environ["DATA_DIR"] = _TMP
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base, engine, SessionLocal  # noqa: E402
from app import models  # noqa: E402,F401  (テーブル定義の登録に必要)


@pytest.fixture
def db():
    """毎テスト、空のスキーマを作り直した DB セッションを返す"""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


class Builder:
    """テストデータを組み立てるヘルパー"""

    def __init__(self, session):
        self.db = session
        self._room_seq = 0

    def room(self, name="Room", floor=1):
        self._room_seq += 1
        r = models.Room(name=f"{name}{self._room_seq}", capacity=100, floor=floor)
        self.db.add(r)
        self.db.flush()
        return r

    def session(self, room, day="2026-08-01", start="10:00", end="11:00",
                required_staff=2, category="general", english_required=0, group_id=None,
                title=None):
        def _at(hhmm):
            h, m = hhmm.split(":")
            return datetime.fromisoformat(f"{day}T{int(h):02d}:{int(m):02d}")

        s = models.Session(
            title=title or f"{day} {start} {category}",
            speaker="speaker",
            start_time=_at(start),
            end_time=_at(end),
            room_id=room.id,
            required_staff=required_staff,
            category=category,
            english_required=english_required,
            group_id=group_id,
        )
        self.db.add(s)
        self.db.flush()
        return s

    def staff(self, name="staff", role="session", max_hours=8, experience_count=1,
              english_ok=0, available_days=None):
        st = models.Staff(
            name=name,
            role=role,
            max_hours=max_hours,
            experience_count=experience_count,
            english_ok=english_ok,
        )
        self.db.add(st)
        self.db.flush()
        for day in available_days or []:
            self.db.add(models.StaffAvailability(
                staff_id=st.id,
                start_time=datetime.fromisoformat(f"{day}T07:00"),
                end_time=datetime.fromisoformat(f"{day}T22:00"),
            ))
        self.db.flush()
        return st

    def category(self, key, label=None, order=1):
        c = models.Category(key=key, label=label or key, color="#000", order=order)
        self.db.add(c)
        self.db.flush()
        return c

    def commit(self):
        self.db.commit()


@pytest.fixture
def build(db):
    return Builder(db)


def assigned_count(db, session_id):
    return db.query(models.Assignment).filter(models.Assignment.session_id == session_id).count()


def staff_hours_on(db, staff_id, day):
    """指定スタッフの、その日の担当時間合計"""
    total = 0.0
    rows = (
        db.query(models.Assignment, models.Session)
        .join(models.Session, models.Assignment.session_id == models.Session.id)
        .filter(models.Assignment.staff_id == staff_id)
        .all()
    )
    for _a, s in rows:
        if s.start_time.date().isoformat() == day:
            total += (s.end_time - s.start_time).total_seconds() / 3600
    return total
