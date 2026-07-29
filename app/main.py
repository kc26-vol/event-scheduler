import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import UPLOAD_DIR
from .database import Base, engine, SessionLocal
from .http_cache import UploadStaticFiles, cache_control_for
from .models import (
    Room, Session as SessionModel, LTTalk, Staff, StaffSkill,
    StaffPreferredSession, StaffAvailability, VenueMap, Assignment, Category, SessionGroup,
    AppSetting,
)
from .proclock import ProcessLock
from .routers import rooms, sessions, staffs, assignments, venue_maps, export, backup, auth, settings, categories, session_groups, auto_backup, public_api

# 起動時の初期化 (テーブル作成・マイグレーション・初期データ投入) は
# 全 worker が同時に走る。CREATE TABLE の「存在確認 → 作成」はプロセスを
# またぐと不可分でないため、素通しにすると
# "table venue_maps already exists" で worker が起動に失敗する。
#
# ここは import 時、つまりイベントループが動き出す前に実行されるので、
# ブロックするロックを掛けても安全 (リクエスト処理系で同じことをすると
# デッドロックする。app/database.py のコメントを参照)。
_init_lock = ProcessLock("init")

# --- Auto-migration: add missing columns to existing tables ---
from sqlalchemy import text as sa_text

def _auto_migrate():
    """Add columns that exist in models but not in the DB (simple ALTER TABLE ADD COLUMN)."""
    with engine.connect() as conn:
        for table in Base.metadata.sorted_tables:
            # Check if table exists
            res = conn.execute(sa_text(
                f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table.name}'"
            ))
            if not res.fetchone():
                continue
            # Get existing columns via PRAGMA
            pragma = conn.execute(sa_text(f"PRAGMA table_info({table.name})"))
            existing = {row[1] for row in pragma.fetchall()}
            for col in table.columns:
                if col.name not in existing:
                    col_type = col.type.compile(engine.dialect)
                    stmt = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {col_type}"
                    print(f"[migration] {stmt}")
                    conn.execute(sa_text(stmt))
                    conn.commit()
                    print(f"[migration] OK: added {table.name}.{col.name}")
                    # Set default value for new text columns (ALTER TABLE adds NULL)
                    if str(col_type).upper() in ("VARCHAR", "TEXT", "STRING"):
                        conn.execute(sa_text(
                            f"UPDATE {table.name} SET {col.name} = '' WHERE {col.name} IS NULL"
                        ))
                        conn.commit()

OVERALL_ROOM_NAME = "全体"


def _ensure_overall_room():
    """全体スケジュール用の削除不可の「全体」部屋を用意し、既存overallを紐付ける。"""
    if not _table_exists("rooms") or not _table_exists("sessions"):
        return
    with engine.connect() as conn:
        row = conn.execute(sa_text(
            "SELECT id FROM rooms WHERE name = :n LIMIT 1"
        ), {"n": OVERALL_ROOM_NAME}).fetchone()
        if row:
            room_id = row[0]
        else:
            # 部屋が1件も無い場合はまだ作らない（初期セットアップ前）
            has_any = conn.execute(sa_text("SELECT 1 FROM rooms LIMIT 1")).fetchone()
            has_overall = conn.execute(sa_text(
                "SELECT 1 FROM sessions WHERE category='overall' LIMIT 1"
            )).fetchone()
            if not has_any and not has_overall:
                return
            conn.execute(sa_text(
                "INSERT INTO rooms (name, capacity, floor) VALUES (:n, 0, 0)"
            ), {"n": OVERALL_ROOM_NAME})
            conn.commit()
            room_id = conn.execute(sa_text(
                "SELECT id FROM rooms WHERE name = :n LIMIT 1"
            ), {"n": OVERALL_ROOM_NAME}).fetchone()[0]
            print(f"[migration] created '{OVERALL_ROOM_NAME}' room (id={room_id})")
        # 既存の全体スケジュールを「全体」部屋に紐付け
        conn.execute(sa_text(
            "UPDATE sessions SET room_id = :rid WHERE category='overall' AND room_id != :rid"
        ), {"rid": room_id})
        conn.commit()


def _table_exists(name: str) -> bool:
    with engine.connect() as conn:
        return conn.execute(sa_text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=:n"
        ), {"n": name}).fetchone() is not None


with _init_lock:
    try:
        Base.metadata.create_all(bind=engine)
        _auto_migrate()
        _ensure_overall_room()
        print("[migration] Auto-migration complete")

        # 既存DBにsetup_completedがない場合、データが存在すれば自動設定
        with engine.connect() as conn:
            row = conn.execute(sa_text("SELECT value FROM app_settings WHERE key='setup_completed'")).fetchone()
            if not row:
                data_exists = conn.execute(sa_text(
                    "SELECT 1 FROM sessions LIMIT 1"
                )).fetchone()
                if data_exists:
                    conn.execute(sa_text(
                        "INSERT INTO app_settings (key, value) VALUES ('setup_completed', '1')"
                    ))
                    conn.commit()
                    print("[migration] Existing data found — setup_completed auto-set")

    except Exception as e:
        print(f"[migration] ERROR: {e}")
        import traceback
        traceback.print_exc()

import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    from .scheduler import backup_scheduler_loop
    task = asyncio.create_task(backup_scheduler_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title="Event Scheduler API", version="1.0.0", lifespan=lifespan)

# add_middleware は「後から足したものほど外側」になる。
# ApiCache を先に足すことで gzip より内側に来る = 非圧縮の本文をキャッシュし、
# 圧縮は Accept-Encoding を見る外側の gzip に任せられる。
#
# 読み取り専用 API のプロセス内キャッシュと ETag。詳細は app/api_cache.py。
from .api_cache import ApiCacheMiddleware
app.add_middleware(ApiCacheMiddleware)

from .compression import SmartGZipMiddleware
# level 9 は level 6 と圧縮率がほぼ同じで CPU だけ余計に食う。
# 画像等は SmartGZipMiddleware 側で圧縮対象から外れる。
app.add_middleware(SmartGZipMiddleware, minimum_size=500, compresslevel=6)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public API CORS middleware (runs before global CORSMiddleware for /public/ paths)
import time as _time
from starlette.middleware.base import BaseHTTPMiddleware as _BaseHTTPMiddleware
from starlette.responses import Response as _Response

_cors_cache: dict = {"origins": "*", "ts": 0.0}
_CORS_CACHE_TTL = 60

class PublicApiCorsMiddleware(_BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        path = request.url.path
        if not path.startswith("/public/"):
            return await call_next(request)

        # Read allowed origins (cached)
        now = _time.time()
        if now - _cors_cache["ts"] > _CORS_CACHE_TTL:
            from .database import SessionLocal
            from .models import AppSetting
            db = SessionLocal()
            try:
                row = db.query(AppSetting).filter(AppSetting.key == "public_api_cors_origins").first()
                _cors_cache["origins"] = row.value if row and row.value else "*"
                _cors_cache["ts"] = now
            finally:
                db.close()

        allowed = _cors_cache["origins"]
        origin = request.headers.get("origin", "")

        # Determine if origin is allowed
        if allowed == "*":
            allow_origin = "*"
        elif origin:
            allowed_list = [o.strip() for o in allowed.split(",") if o.strip()]
            allow_origin = origin if origin in allowed_list else None
        else:
            allow_origin = None

        # Handle OPTIONS preflight
        if request.method == "OPTIONS" and allow_origin:
            resp = _Response(status_code=200)
            resp.headers["Access-Control-Allow-Origin"] = allow_origin
            resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            resp.headers["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
            resp.headers["Access-Control-Max-Age"] = "3600"
            return resp

        response = await call_next(request)
        if allow_origin:
            response.headers["Access-Control-Allow-Origin"] = allow_origin
            response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "X-API-Key, Content-Type"
        return response

app.add_middleware(PublicApiCorsMiddleware)

# Security: headers + rate limiting + auth
from .security import SecurityHeadersMiddleware, RateLimitMiddleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)

import os
from .auth_middleware import AuthMiddleware
app.add_middleware(AuthMiddleware)

app.include_router(auth.router)
app.include_router(rooms.router)
app.include_router(sessions.router)
app.include_router(staffs.router)
app.include_router(assignments.router)
app.include_router(venue_maps.router)
app.include_router(export.router)
app.include_router(backup.router)
app.include_router(settings.router)
app.include_router(categories.router)
app.include_router(session_groups.router)
app.include_router(auto_backup.router)
app.include_router(public_api.public_router)
app.include_router(public_api.admin_router)


def _seed_all():
    """初期データ投入: seed/data.json + デフォルトカテゴリ + デフォルトセッショングループ"""
    db = SessionLocal()
    try:
        # --- デフォルトカテゴリ ---
        if db.query(Category).count() == 0:
            db.add(Category(key="reception", label="受付案内", color="#388e3c", order=1))
            db.add(Category(key="social", label="懇親会", color="#7b1fa2", order=2))
            db.commit()

        # --- デフォルトセッショングループ ---
        if db.query(SessionGroup).count() == 0:
            grp = SessionGroup(label="セッション", date="", order=1, color="#1a73e8")
            db.add(grp)
            db.commit()

        # --- seed/data.json からの初期データ ---
        seed_dir = Path(__file__).resolve().parent.parent / "seed"
        seed_file = seed_dir / "data.json"
        if not seed_file.exists():
            return
        if db.query(Room).count() > 0:
            return

        with open(seed_file, encoding="utf-8") as f:
            data = json.load(f)
        if "rooms" not in data:
            return

        seed_uploads = seed_dir / "uploads"
        file_path_map: dict[str, str] = {}
        if seed_uploads.exists():
            for src_file in seed_uploads.iterdir():
                if src_file.is_file():
                    ext = src_file.suffix.lower()
                    new_name = f"{uuid.uuid4().hex}{ext}"
                    shutil.copy2(src_file, UPLOAD_DIR / new_name)
                    file_path_map[f"/uploads/{src_file.name}"] = f"/uploads/{new_name}"

        def _map_path(original: str) -> str:
            if not original:
                return ""
            return file_path_map.get(original, original)

        room_map = {}
        session_map = {}
        staff_map = {}

        for r in data.get("rooms", []):
            db_room = Room(name=r["name"], capacity=r["capacity"], floor=r.get("floor", 1))
            db.add(db_room)
            db.flush()
            room_map[r["id"]] = db_room.id

        for v in data.get("venue_maps", []):
            db.add(VenueMap(
                title=v["title"], image=_map_path(v.get("image", "")), order=v.get("order", 0),
            ))

        for s in data.get("sessions", []):
            new_room_id = room_map.get(s["room_id"], s["room_id"])
            db_sess = SessionModel(
                title=s["title"], description=s.get("description", ""),
                notes=s.get("notes", ""), speaker=s["speaker"],
                speaker_kana=s.get("speaker_kana", ""),
                speaker_photo=_map_path(s.get("speaker_photo", "")),
                speaker_org=s.get("speaker_org", ""),
                speaker_title=s.get("speaker_title", ""),
                speaker_profile=s.get("speaker_profile", ""),
                start_time=datetime.fromisoformat(s["start_time"]),
                end_time=datetime.fromisoformat(s["end_time"]),
                room_id=new_room_id,
                required_staff=s.get("required_staff", 1),
                category=s.get("category", "general"),
                english_required=s.get("english_required", 0),
            )
            db.add(db_sess)
            db.flush()
            session_map[s["id"]] = db_sess.id
            for t in s.get("lt_talks", []):
                db.add(LTTalk(
                    session_id=db_sess.id, title=t["title"], speaker=t["speaker"],
                    speaker_kana=t.get("speaker_kana", ""),
                    speaker_org=t.get("speaker_org", ""),
                    speaker_title=t.get("speaker_title", ""),
                    order=t.get("order", 0),
                ))

        for st in data.get("staffs", []):
            db_staff = Staff(
                name=st["name"], slack_name=st.get("slack_name", ""),
                photo=_map_path(st.get("photo", "")),
                english_ok=st.get("english_ok", 0),
                role=st.get("role", "general"),
                max_hours=st.get("max_hours", 8),
                experience_count=st.get("experience_count", 0),
            )
            db.add(db_staff)
            db.flush()
            staff_map[st["id"]] = db_staff.id
            for skill in st.get("skills", []):
                db.add(StaffSkill(staff_id=db_staff.id, skill=skill))
            for p in st.get("preferred_sessions", []):
                new_sess_id = session_map.get(p["session_id"])
                if new_sess_id:
                    db.add(StaffPreferredSession(
                        staff_id=db_staff.id, session_id=new_sess_id, priority=p["priority"],
                    ))
            for a in st.get("availabilities", []):
                db.add(StaffAvailability(
                    staff_id=db_staff.id,
                    start_time=datetime.fromisoformat(a["start_time"]),
                    end_time=datetime.fromisoformat(a["end_time"]),
                ))

        for a in data.get("assignments", []):
            new_sess_id = session_map.get(a["session_id"])
            new_staff_id = staff_map.get(a["staff_id"])
            if new_sess_id and new_staff_id:
                db.add(Assignment(
                    session_id=new_sess_id, staff_id=new_staff_id, role=a.get("role", "support"),
                ))

        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


# 「まだ空か」を確認してから投入するので、worker 間で不可分にする必要がある。
with _init_lock:
    _seed_all()

@app.get("/setup.html", response_class=HTMLResponse)
def setup_page():
    from .auth_middleware import is_setup_complete
    if is_setup_complete():
        return RedirectResponse(url="/login.html", status_code=302)
    html = Path("frontend/public/setup.html").read_text(encoding="utf-8")
    return HTMLResponse(content=html)


@app.get("/login.html", response_class=HTMLResponse)
def login_page():
    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter(AppSetting.key == "app_title").first()
        title = row.value if row and row.value else "Event Scheduler"
    finally:
        db.close()
    html = Path("frontend/public/login.html").read_text(encoding="utf-8")
    html = html.replace("{{APP_TITLE}}", title)
    return HTMLResponse(content=html)


class SPAStaticFiles(StaticFiles):
    """SPA 配信用 StaticFiles。

    /api, /auth, /uploads, /public 等は先に登録されたルーター/マウントが処理する。
    ここに到達したパスで実ファイルが存在しない場合 (例: /rooms, /staff-detail などの
    Vue Router のクライアントサイドルート) は index.html を返す。
    """

    async def get_response(self, path: str, scope):
        from starlette.exceptions import HTTPException as StarletteHTTPException

        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code != 404:
                raise
            path = "index.html"
            response = await super().get_response(path, scope)
        if response.status_code in (200, 304):
            response.headers["Cache-Control"] = cache_control_for(path)
        return response


app.mount("/uploads", UploadStaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# フロントエンドは Vite ビルド成果物 (frontend/dist) を配信する。
# 未ビルドの場合は frontend/public (login.html 等の静的ファイルのみ) にフォールバック。
_frontend_dist = Path("frontend/dist")
_frontend_static = _frontend_dist if _frontend_dist.is_dir() else Path("frontend/public")
if not _frontend_dist.is_dir():
    print("[frontend] frontend/dist が見つかりません。`cd frontend && pnpm build` を実行してください")
app.mount("/", SPAStaticFiles(directory=str(_frontend_static), html=True), name="frontend")
