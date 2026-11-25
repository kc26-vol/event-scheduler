"""Copy a frozen legacy DATA_DIR's uploads and indexed archives to a prepared Worker."""
import argparse
import json
import mimetypes
import sqlite3
import subprocess
import tempfile
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"
WRANGLER = WEB / "node_modules/.bin/wrangler"


def source_file(directory, filename):
    path = directory / filename
    if directory.is_symlink() or Path(filename).name != filename or path.is_symlink() or not path.is_file():
        raise ValueError(f"Missing or unexpected file in {directory.name}: {filename!r}")
    return path


def plan(data):
    objects, rows = [], []
    uploads = data / "uploads"
    if uploads.is_dir():
        for entry in sorted(uploads.iterdir()):
            if entry.name.startswith("."):
                continue
            path = source_file(uploads, entry.name)
            objects.append((path, "uploads/" + path.name))
    for directory, kind in [("backups", "backup"), ("public_snapshots", "snapshot")]:
        folder = data / directory
        if not (folder / "metadata.json").exists():
            if folder.exists() and any(folder.glob("*.zip" if kind == "backup" else "*.json")):
                raise ValueError(f"Missing archive index in {directory}")
            continue
        index = source_file(folder, "metadata.json")
        for entry in json.loads(index.read_text(encoding="utf-8")):
            item = entry["id"]
            if kind == "backup":
                path = source_file(folder, entry["filename"])
                # Both old indexes used timestamps for IDs; the new index shares one keyspace.
                archive_id, created = "legacy-backup-" + item, entry["created_at"]
            else:
                path = source_file(folder, item + ".json")
                archive_id, created = item, entry["published_at"]
            key = directory + "/" + path.name
            rows.append((archive_id, kind, created, key, path.stat().st_size, entry.get("session_count"), entry.get("trigger")))
            objects.append((path, key))
    return objects, rows


def run(data, config_path, remote):
    if not data.is_dir() or not (data / "scheduler.db").is_file():
        raise ValueError("Expected a frozen DATA_DIR containing scheduler.db")
    config = json.loads(config_path.read_text())
    bucket = next(b["bucket_name"] for b in config["r2_buckets"] if b["binding"] == "STORAGE")
    objects, rows = plan(data)
    print(f"{config['name']}: {len(objects)} R2 objects, {len(rows)} archive records", flush=True)
    if not remote:
        return
    args = ["--remote", "--config", str(config_path.resolve())]
    for path, key in objects:
        media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        subprocess.run([WRANGLER, "r2", "object", "put", bucket + "/" + key, "--file", path, "--content-type", media_type, *args], check=True, cwd=WEB)
    if rows:
        # Publish the archive index after every referenced object exists. A retry can resume safely.
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql") as sql, sqlite3.connect(":memory:") as db:
            for row in rows:
                values = ", ".join(db.execute("SELECT quote(?)", (value,)).fetchone()[0] for value in row)
                sql.write("INSERT INTO archives (id,kind,created_at,object_key,size_bytes,session_count,trigger) VALUES (" + values + ") ON CONFLICT(id) DO NOTHING;\n")
            sql.flush()
            subprocess.run([WRANGLER, "d1", "execute", "DB", "--file", sql.name, *args], check=True, cwd=WEB)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--apply-remote", action="store_true", help="Upload to the D1 and R2 resources in the selected config")
    options = parser.parse_args()
    run(options.data_dir.resolve(), options.config, options.apply_remote)
