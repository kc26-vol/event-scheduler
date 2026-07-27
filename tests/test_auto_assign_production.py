"""本番データ（scheduler.db）に対する回帰テスト。

scheduler.db は .gitignore 対象なので、手元にある場合だけ実行する。
「日程ごとに1回ずつ実行すれば未配置が残らない」ことを保証する。
"""
import os
import shutil
from pathlib import Path

import pytest

PROD_DB = Path(__file__).resolve().parents[1] / "scheduler.db"

pytestmark = pytest.mark.skipif(
    not PROD_DB.exists(),
    reason="scheduler.db がないためスキップ（本番データ回帰テスト）",
)


@pytest.fixture
def prod_db():
    """本番DBのコピーに対する DB セッション"""
    from app.database import SessionLocal, engine
    from app.config import DATA_DIR

    engine.dispose()
    shutil.copy(PROD_DB, Path(DATA_DIR) / "scheduler.db")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
        os.remove(Path(DATA_DIR) / "scheduler.db")


def test_日程ごとに実行すれば未配置が残らない(prod_db):
    from app.models import Session as S, Assignment
    from app.routers.assignments import auto_assign_staff, AutoAssignRequest

    sessions = prod_db.query(S).all()
    days = sorted({s.start_time.date().isoformat() for s in sessions})
    assert len(days) >= 2, "複数日のデータであることを前提にしたテスト"

    for day in days:
        res = auto_assign_staff(AutoAssignRequest(target_date=day), prod_db)
        assert res["understaffed"] == [], (
            f"{day} で人員不足: "
            + ", ".join(f"{u['session_title']}({u['assigned']}/{u['required']})"
                        for u in res["understaffed"][:5])
        )

    # 全日程を通して、必要人数を満たしていないセッションが1件もないこと
    counts = {}
    for a in prod_db.query(Assignment).all():
        counts[a.session_id] = counts.get(a.session_id, 0) + 1
    short = [
        s for s in prod_db.query(S).all()
        if s.category != "overall" and s.required_staff > 0
        and counts.get(s.id, 0) < s.required_staff
    ]
    assert short == [], f"{len(short)} 件のセッションが人員不足"


def test_日ごとのmax_hoursが守られている(prod_db):
    from app.models import Session as S, Staff, Assignment
    from app.routers.assignments import auto_assign_staff, AutoAssignRequest

    sessions = prod_db.query(S).all()
    for day in sorted({s.start_time.date().isoformat() for s in sessions}):
        auto_assign_staff(AutoAssignRequest(target_date=day), prod_db)

    max_hours = {st.id: st.max_hours for st in prod_db.query(Staff).all()}
    by_id = {s.id: s for s in prod_db.query(S).all()}
    hours = {}
    for a in prod_db.query(Assignment).all():
        s = by_id[a.session_id]
        key = (a.staff_id, s.start_time.date())
        hours[key] = hours.get(key, 0.0) + (s.end_time - s.start_time).total_seconds() / 3600

    over = {k: v for k, v in hours.items() if v > max_hours[k[0]] + 1e-9}
    assert not over, f"日ごとの max_hours 超過: {list(over.items())[:5]}"
