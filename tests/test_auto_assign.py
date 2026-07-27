"""自動配置（日程ごと）のテスト"""
import pytest
from fastapi import HTTPException

from app.routers.assignments import auto_assign_staff, AutoAssignRequest
from conftest import assigned_count, staff_hours_on

D1 = "2026-08-01"
D2 = "2026-08-02"


def run(db, **kwargs):
    return auto_assign_staff(AutoAssignRequest(**kwargs), db)


# --- 日程指定の必須化 ------------------------------------------------------

def test_全日程一括の自動配置は拒否される(build, db):
    room = build.room()
    build.session(room, day=D1)
    build.staff(name="A", available_days=[D1])
    build.commit()

    with pytest.raises(HTTPException) as e:
        run(db)
    assert e.value.status_code == 400
    assert "日程ごと" in e.value.detail


def test_bodyなしの呼び出しも拒否される(build, db):
    room = build.room()
    build.session(room, day=D1)
    build.commit()

    with pytest.raises(HTTPException) as e:
        auto_assign_staff(None, db)
    assert e.value.status_code == 400


def test_複数日にまたがるsession_ids指定は拒否される(build, db):
    room = build.room()
    s1 = build.session(room, day=D1)
    s2 = build.session(room, day=D2)
    build.staff(name="A", available_days=[D1, D2])
    build.commit()

    with pytest.raises(HTTPException) as e:
        run(db, session_ids=[s1.id, s2.id])
    assert e.value.status_code == 400
    assert "複数日" in e.value.detail


def test_不正な日付形式は拒否される(build, db):
    room = build.room()
    build.session(room, day=D1)
    build.commit()

    with pytest.raises(HTTPException) as e:
        run(db, target_date="2026/08/01")
    assert e.value.status_code == 400
    assert "YYYY-MM-DD" in e.value.detail


def test_セッションがない日付は拒否される(build, db):
    room = build.room()
    build.session(room, day=D1)
    build.commit()

    with pytest.raises(HTTPException) as e:
        run(db, target_date="2026-12-31")
    assert e.value.status_code == 400


# --- 対象範囲: その日の全セッション ---------------------------------------

def test_target_dateはその日の全カテゴリを対象にする(build, db):
    """セッション担当・受付案内・懇親会をまたいで、その日の全セッションが配置される"""
    build.category("reception", "受付案内")
    build.category("social", "懇親会")
    room = build.room()
    sess = build.session(room, day=D1, start="10:00", end="11:00", category="general")
    recp = build.session(room, day=D1, start="12:00", end="13:00", category="reception")
    soc = build.session(room, day=D1, start="14:00", end="15:00", category="social")
    for i in range(4):
        build.staff(name=f"S{i}", role="session,reception,social", available_days=[D1])
    build.commit()

    res = run(db, target_date=D1)

    assert res["target_date"] == D1
    assert res["understaffed"] == []
    assert assigned_count(db, sess.id) == 2
    assert assigned_count(db, recp.id) == 2
    assert assigned_count(db, soc.id) == 2


def test_他の日の配置は保持される(build, db):
    room = build.room()
    s1 = build.session(room, day=D1)
    s2 = build.session(room, day=D2)
    for i in range(4):
        build.staff(name=f"S{i}", available_days=[D1, D2])
    build.commit()

    run(db, target_date=D1)
    assert assigned_count(db, s1.id) == 2

    run(db, target_date=D2)
    assert assigned_count(db, s2.id) == 2
    assert assigned_count(db, s1.id) == 2, "D2 の配置で D1 の配置が消えてはいけない"


def test_同じ日を再実行すると上書きされ重複しない(build, db):
    room = build.room()
    s1 = build.session(room, day=D1)
    for i in range(4):
        build.staff(name=f"S{i}", available_days=[D1])
    build.commit()

    run(db, target_date=D1)
    run(db, target_date=D1)
    assert assigned_count(db, s1.id) == 2


def test_session_idsでその日の中をさらに絞り込める(build, db):
    room = build.room()
    a = build.session(room, day=D1, start="10:00", end="11:00")
    b = build.session(room, day=D1, start="12:00", end="13:00")
    for i in range(4):
        build.staff(name=f"S{i}", available_days=[D1])
    build.commit()

    res = run(db, target_date=D1, session_ids=[a.id])
    assert res["total_sessions"] == 1
    assert assigned_count(db, a.id) == 2
    assert assigned_count(db, b.id) == 0


def test_target_dateと無関係なsession_idsは拒否される(build, db):
    room = build.room()
    build.session(room, day=D1)
    s2 = build.session(room, day=D2)
    build.commit()

    with pytest.raises(HTTPException) as e:
        run(db, target_date=D1, session_ids=[s2.id])
    assert e.value.status_code == 400


# --- 集計の正しさ ----------------------------------------------------------

def test_配置不要セッションは充足率の分母に含まれない(build, db):
    """required_staff=0 / -1 / overall は skipped として分離される"""
    room = build.room()
    build.session(room, day=D1, start="10:00", end="11:00", required_staff=2)
    build.session(room, day=D1, start="12:00", end="13:00", required_staff=0)
    build.session(room, day=D1, start="14:00", end="15:00", required_staff=-1)
    build.session(room, day=D1, start="16:00", end="17:00", required_staff=2, category="overall")
    for i in range(2):
        build.staff(name=f"S{i}", available_days=[D1])
    build.commit()

    res = run(db, target_date=D1)

    assert res["total_sessions"] == 1, "人員が必要なセッションのみが分母"
    assert res["fully_assigned"] == 1
    assert res["skipped_sessions"] == 3
    assert res["required_slots"] == 2
    assert res["assigned_slots"] == 2


def test_人員不足はunderstaffedに現れる(build, db):
    room = build.room()
    s = build.session(room, day=D1, required_staff=4)
    build.staff(name="A", available_days=[D1])
    build.commit()

    res = run(db, target_date=D1)

    assert res["fully_assigned"] == 0
    assert len(res["understaffed"]) == 1
    assert res["understaffed"][0]["session_id"] == s.id
    assert res["understaffed"][0]["assigned"] == 1
    assert res["understaffed"][0]["required"] == 4
    assert res["assigned_slots"] == 1
    assert res["required_slots"] == 4


# --- ハード制約が日単位で効くこと -----------------------------------------

def test_max_hoursは日ごとの上限として適用される(build, db):
    """max_hours=4 のスタッフが2日連続で4時間ずつ担当できる（合計8時間）"""
    room = build.room()
    day1 = [build.session(room, day=D1, start=f"{10+2*i}:00", end=f"{12+2*i}:00", required_staff=1)
            for i in range(2)]
    day2 = [build.session(room, day=D2, start=f"{10+2*i}:00", end=f"{12+2*i}:00", required_staff=1)
            for i in range(2)]
    build.staff(name="Only", max_hours=4, available_days=[D1, D2])
    build.commit()

    run(db, target_date=D1)
    run(db, target_date=D2)

    for s in day1 + day2:
        assert assigned_count(db, s.id) == 1
    assert staff_hours_on(db, 1, D1) == 4
    assert staff_hours_on(db, 1, D2) == 4


def test_max_hoursを日内で超えることはない(build, db):
    room = build.room()
    sessions = [build.session(room, day=D1, start=f"{9+2*i}:00", end=f"{11+2*i}:00", required_staff=1)
                for i in range(4)]
    a = build.staff(name="A", max_hours=4, available_days=[D1])
    b = build.staff(name="B", max_hours=4, available_days=[D1])
    build.commit()

    res = run(db, target_date=D1)

    assert res["understaffed"] == []
    assert staff_hours_on(db, a.id, D1) <= 4
    assert staff_hours_on(db, b.id, D1) <= 4
    assert sum(assigned_count(db, s.id) for s in sessions) == 4


def test_活動可能時間外のスタッフは配置されない(build, db):
    room = build.room()
    s = build.session(room, day=D1, required_staff=2)
    ok = build.staff(name="OK", available_days=[D1])
    build.staff(name="NG", available_days=[D2])  # D1 は活動不可
    build.commit()

    res = run(db, target_date=D1)

    from app.models import Assignment
    ids = [a.staff_id for a in db.query(Assignment).all()]
    assert ok.id in ids
    assert len(res["understaffed"]) == 1, "活動可能なスタッフが1人しかいないので不足する"
    assert assigned_count(db, s.id) == 1


def test_時間が重複するセッションに同じスタッフは入らない(build, db):
    r1 = build.room(floor=1)
    r2 = build.room(floor=1)
    a = build.session(r1, day=D1, start="10:00", end="11:00", required_staff=1)
    b = build.session(r2, day=D1, start="10:30", end="11:30", required_staff=1)
    build.staff(name="A", available_days=[D1])
    build.staff(name="B", available_days=[D1])
    build.commit()

    res = run(db, target_date=D1)

    assert res["understaffed"] == []
    from app.models import Assignment
    ids = {a.session_id: a.staff_id for a in db.query(Assignment).all()}
    assert ids[a.id] != ids[b.id]


# --- fill_only -------------------------------------------------------------

def test_fill_onlyは既存配置を維持して不足分だけ埋める(build, db):
    from app.models import Assignment
    room = build.room()
    s = build.session(room, day=D1, required_staff=2)
    keep = build.staff(name="Keep", available_days=[D1])
    build.staff(name="Other", available_days=[D1])
    db.add(Assignment(session_id=s.id, staff_id=keep.id, role="session"))
    build.commit()

    res = run(db, target_date=D1, fill_only=True)

    assert res["understaffed"] == []
    staff_ids = {a.staff_id for a in db.query(Assignment).filter(Assignment.session_id == s.id).all()}
    assert keep.id in staff_ids
    assert len(staff_ids) == 2


def test_fill_onlyも日程指定が必須(build, db):
    room = build.room()
    build.session(room, day=D1)
    build.commit()

    with pytest.raises(HTTPException) as e:
        run(db, fill_only=True)
    assert e.value.status_code == 400
