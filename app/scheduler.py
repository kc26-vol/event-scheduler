"""Background auto-backup scheduler using asyncio.

gunicorn を複数 worker で動かすため、以下の2点を保証する。

1. スケジューラのループは同時に1プロセスでしか回らない (リーダー選出)。
   全 worker で回すと、同じ時刻に同じ zip を作って metadata.json を
   互いに上書きしてしまう。
2. 状態 (次回実行時刻など) は全 worker から読める場所に置く。
   /api/backup/auto/status はどの worker に当たるか分からないため、
   プロセス内の変数だけだとリーダー以外は空を返してしまう。
"""

import asyncio
import json
import os
import time
from datetime import datetime

from .config import BACKUP_DIR, now as app_now
from .database import SessionLocal
from .proclock import ProcessLock, try_acquire_leadership
from .routers.backup import create_backup_zip

# バックアップの実行そのものを排他する。
# リーダーの定期実行と、任意 worker に届く手動トリガー (POST /run) が
# 同時に走らないようにするため。
backup_lock = ProcessLock("backup")

# Runtime state (read by status endpoint)
scheduler_state = {
    "running": False,
    "last_run": None,
    "last_result": None,
    "next_run": None,
    "error": None,
}

# worker 間で共有する状態。BACKUP_DIR は全 worker から見える永続ストレージ。
STATE_FILE = BACKUP_DIR / "scheduler_state.json"

# 自プロセスがスケジューラのリーダーかどうか
_is_leader = False

# リーダーが空いていないか確認する間隔。リーダーが落ちてから
# 別 worker が引き継ぐまでの最大待ち時間でもある。
LEADER_POLL_SECONDS = 30


def publish_state():
    """自プロセスの scheduler_state を全 worker から読める場所へ書き出す。"""
    tmp = STATE_FILE.with_suffix(".json.tmp")
    try:
        tmp.write_text(json.dumps(scheduler_state, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, STATE_FILE)  # 読み手が中途半端な内容を見ないよう原子的に差し替える
    except OSError:
        pass


def read_shared_state() -> dict:
    """リーダーが公開した状態を読む。読めなければ自プロセスの状態を返す。"""
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return dict(scheduler_state)


def recalc_next_run():
    """設定変更時に next_run を即座に再計算

    設定変更のリクエストがリーダー以外の worker に届いた場合、ここで共有状態を
    書き換えるとリーダーの持つ正しい値を潰してしまう。その場合は自プロセスの
    状態だけ更新し、共有状態はリーダーの次のループ (最長30秒) で追いつかせる。
    """
    db = SessionLocal()
    try:
        enabled = _get_setting(db, "autobackup_enabled", "0") == "1"
        if not enabled:
            scheduler_state["next_run"] = None
            return
        schedule_type = _get_setting(db, "autobackup_schedule_type", "interval")
        if schedule_type == "daily":
            daily_time = _get_setting(db, "autobackup_daily_time", "03:00")
            scheduler_state["next_run"] = _calc_next_daily(daily_time).isoformat()
        else:
            interval_minutes = int(_get_setting(db, "autobackup_interval_minutes", "720"))
            interval_seconds = max(interval_minutes * 60, 600)
            last = scheduler_state.get("last_run")
            if last:
                next_ts = last + interval_seconds
                if next_ts < time.time():
                    next_ts = time.time() + interval_seconds
            else:
                next_ts = time.time() + interval_seconds
            scheduler_state["next_run"] = datetime.fromtimestamp(
                next_ts, tz=app_now().tzinfo
            ).isoformat()
    finally:
        db.close()
    if _is_leader:
        publish_state()


def _restore_last_run():
    """サーバー起動時にmetadataから最終バックアップ時刻を復元"""
    metadata = _read_metadata()
    if not metadata:
        return
    metadata.sort(key=lambda x: x.get("created_at", ""))
    latest = metadata[-1]
    try:
        ts = datetime.fromisoformat(latest["created_at"]).timestamp()
        scheduler_state["last_run"] = ts
        scheduler_state["last_result"] = latest
    except (ValueError, KeyError):
        pass

METADATA_FILE = BACKUP_DIR / "metadata.json"


def _read_metadata() -> list[dict]:
    if METADATA_FILE.exists():
        try:
            return json.loads(METADATA_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
    return []


def _write_metadata(entries: list[dict]):
    # 読み手が書きかけの内容を見ないよう、一時ファイル経由で原子的に置き換える。
    tmp = METADATA_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, METADATA_FILE)


def _get_setting(db, key: str, default: str = "") -> str:
    from .models import AppSetting
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return row.value if row else default


def run_backup(trigger: str = "auto") -> dict:
    """Execute a backup synchronously. Returns metadata entry.

    リーダーの定期実行と手動トリガー (POST /run、どの worker にも届きうる) が
    重ならないよう、バックアップ全体をプロセス間ロックで直列化する。
    """
    with backup_lock:
        return _run_backup_locked(trigger)


def _run_backup_locked(trigger: str) -> dict:
    now = app_now()
    backup_id = now.strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{backup_id}.zip"
    filepath = BACKUP_DIR / filename

    db = SessionLocal()
    try:
        zip_bytes = create_backup_zip(db)
        filepath.write_bytes(zip_bytes)

        entry = {
            "id": backup_id,
            "filename": filename,
            "created_at": now.isoformat(),
            "size_bytes": len(zip_bytes),
            "trigger": trigger,
            "status": "ok",
        }

        # Append to metadata
        metadata = _read_metadata()
        metadata.append(entry)
        _write_metadata(metadata)

        # Enforce retention
        retention = int(_get_setting(db, "autobackup_retention_count", "28"))
        _enforce_retention(retention)

        return entry
    except Exception as e:
        return {
            "id": backup_id,
            "filename": filename,
            "created_at": now.isoformat(),
            "size_bytes": 0,
            "trigger": trigger,
            "status": "error",
            "error": str(e),
        }
    finally:
        db.close()


def _enforce_retention(max_count: int):
    """Delete oldest backups beyond retention count."""
    metadata = _read_metadata()
    if len(metadata) <= max_count:
        return

    # Sort by created_at, keep newest
    metadata.sort(key=lambda x: x["created_at"])
    to_delete = metadata[:-max_count]
    to_keep = metadata[-max_count:]

    for entry in to_delete:
        fpath = BACKUP_DIR / entry["filename"]
        if fpath.exists():
            fpath.unlink()

    _write_metadata(to_keep)


def _calc_next_daily(daily_time: str) -> datetime:
    """Calculate the next occurrence of a daily time (HH:MM)."""
    from datetime import timedelta
    now = app_now()
    try:
        hour, minute = map(int, daily_time.split(":"))
    except (ValueError, AttributeError):
        hour, minute = 3, 0
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return target


async def backup_scheduler_loop():
    """全 worker が起動するが、リーダーになれた1プロセスだけが実際に回す。

    リーダーが死ねば OS が flock を解放するので、待機している worker が
    次のポーリングで引き継ぐ。
    """
    global _is_leader
    while True:
        leader = try_acquire_leadership("scheduler")
        if leader is None:
            # 別 worker がリーダー。空きが出るまで待つ。
            try:
                await asyncio.sleep(LEADER_POLL_SECONDS)
            except asyncio.CancelledError:
                return
            continue

        _is_leader = True
        print(f"[scheduler] このプロセスがリーダーになりました (pid={os.getpid()})")
        try:
            await _leader_loop()
            return  # 正常に抜けるのはキャンセル時だけ
        except asyncio.CancelledError:
            return
        except Exception as e:
            # ここで諦めるとスケジューラが止まったままになる。
            # リーダー権を手放して、誰か (自分を含む) が拾い直せるようにする。
            print(f"[scheduler] リーダーのループが異常終了しました: {e}")
        finally:
            _is_leader = False
            leader.release()

        try:
            await asyncio.sleep(LEADER_POLL_SECONDS)
        except asyncio.CancelledError:
            return


async def _leader_loop():
    """Main scheduler loop — runs as asyncio background task."""
    scheduler_state["running"] = True
    _restore_last_run()
    publish_state()
    print("[scheduler] Auto-backup scheduler started")

    try:
        while True:
            db = SessionLocal()
            try:
                enabled = _get_setting(db, "autobackup_enabled", "0") == "1"
                schedule_type = _get_setting(db, "autobackup_schedule_type", "interval")
                interval_minutes = int(_get_setting(db, "autobackup_interval_minutes", "720"))
                daily_time = _get_setting(db, "autobackup_daily_time", "03:00")
            finally:
                db.close()

            if not enabled:
                scheduler_state["next_run"] = None
                publish_state()
                await asyncio.sleep(30)
                continue

            if schedule_type == "daily":
                # Daily mode: run at specific time
                next_run = _calc_next_daily(daily_time)
                scheduler_state["next_run"] = next_run.isoformat()
                publish_state()
                wait_seconds = (next_run - app_now()).total_seconds()
                if wait_seconds > 0:
                    await asyncio.sleep(min(wait_seconds, 30))
                    if wait_seconds > 30:
                        continue
                # Time to run
                try:
                    result = await asyncio.get_event_loop().run_in_executor(None, run_backup, "auto")
                    scheduler_state["last_run"] = time.time()
                    scheduler_state["last_result"] = result
                    scheduler_state["error"] = None
                    print(f"[scheduler] Daily backup completed: {result.get('filename')} ({result.get('status')})")
                except Exception as e:
                    scheduler_state["error"] = str(e)
                    scheduler_state["last_run"] = time.time()
                    print(f"[scheduler] Daily backup failed: {e}")
                publish_state()
                # 次回予定を即座に更新
                scheduler_state["next_run"] = _calc_next_daily(daily_time).isoformat()
                publish_state()
                await asyncio.sleep(60)  # avoid re-trigger within same minute
            else:
                # Interval mode
                interval_seconds = max(interval_minutes * 60, 600)

                last = scheduler_state.get("last_run")
                if last:
                    elapsed = time.time() - last
                    if elapsed < interval_seconds:
                        remaining = interval_seconds - elapsed
                        scheduler_state["next_run"] = datetime.fromtimestamp(
                            last + interval_seconds, tz=app_now().tzinfo
                        ).isoformat()
                        publish_state()
                        await asyncio.sleep(min(remaining, 30))
                        continue

                # next_run を先にセットしてからバックアップ実行
                scheduler_state["next_run"] = datetime.fromtimestamp(
                    time.time() + interval_seconds, tz=app_now().tzinfo
                ).isoformat()
                try:
                    result = await asyncio.get_event_loop().run_in_executor(None, run_backup, "auto")
                    scheduler_state["last_run"] = time.time()
                    scheduler_state["last_result"] = result
                    scheduler_state["error"] = None
                    # バックアップ完了後に正確な next_run を再計算
                    scheduler_state["next_run"] = datetime.fromtimestamp(
                        scheduler_state["last_run"] + interval_seconds, tz=app_now().tzinfo
                    ).isoformat()
                    print(f"[scheduler] Backup completed: {result.get('filename')} ({result.get('status')})")
                except Exception as e:
                    scheduler_state["error"] = str(e)
                    scheduler_state["last_run"] = time.time()
                    print(f"[scheduler] Backup failed: {e}")

                publish_state()
                await asyncio.sleep(30)

    except asyncio.CancelledError:
        print("[scheduler] Auto-backup scheduler stopped")
    finally:
        scheduler_state["running"] = False
        publish_state()
