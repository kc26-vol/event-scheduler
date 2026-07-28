import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

DATA_DIR = Path(os.environ.get("DATA_DIR", "."))

# DATA_DIR を明示設定している = 永続ストレージを使う意図がある、とみなして検証する。
# 永続ボリュームが使えると確認できるまで、以降の mkdir / create_all に進まない。
# 未マウントのまま進むと空のDBを作ってしまい、本番データが消えたように見えるため。
# DATA_DIR 未設定 (ローカル開発) では従来どおり素通りする。
if "DATA_DIR" in os.environ:
    from .storage_guard import ensure_persistent_volume_ready

    ensure_persistent_volume_ready(
        DATA_DIR,
        allow_empty=os.environ.get("ALLOW_EMPTY_DATA_DIR") == "1",
    )

UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DIR = DATA_DIR / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{DATA_DIR}/scheduler.db"

# ---------------------------------------------------------------------------
# Timezone helper
# ---------------------------------------------------------------------------
_tz_cache: ZoneInfo | None = None
_tz_loaded_at: float = 0.0
# gunicorn を複数 worker で動かすため、reload_tz() は設定変更を処理した worker に
# しか効かない。他の worker がいつまでも古いタイムゾーンを使い続けないよう、
# キャッシュに寿命を持たせて自力で追いつかせる。
_TZ_CACHE_TTL = 60.0


def get_app_tz() -> ZoneInfo:
    """app_settings の timezone 値からタイムゾーンを取得（キャッシュ付き）"""
    global _tz_cache, _tz_loaded_at
    if _tz_cache is not None and time.time() - _tz_loaded_at < _TZ_CACHE_TTL:
        return _tz_cache
    try:
        from .database import SessionLocal
        from .models import AppSetting
        db = SessionLocal()
        try:
            row = db.query(AppSetting).filter(AppSetting.key == "timezone").first()
            tz_name = row.value if row and row.value else "Asia/Tokyo"
            _tz_cache = ZoneInfo(tz_name)
        finally:
            db.close()
    except Exception:
        _tz_cache = ZoneInfo("Asia/Tokyo")
    _tz_loaded_at = time.time()
    return _tz_cache


def reload_tz():
    """タイムゾーン設定変更後にキャッシュをクリア

    これを呼べるのは設定変更を処理した worker だけ。他の worker は
    _TZ_CACHE_TTL の経過を待って追いつく。
    """
    global _tz_cache, _tz_loaded_at
    _tz_cache = None
    _tz_loaded_at = 0.0


def now() -> datetime:
    """アプリのタイムゾーンで現在時刻を返す"""
    return datetime.now(get_app_tz())
