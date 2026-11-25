"""Export the legacy SQLite rows for import into a freshly migrated D1 database."""
import argparse
import sqlite3
import tempfile
from pathlib import Path

MIGRATIONS = Path(__file__).resolve().parents[1] / "web" / "migrations"
TABLES = (
    "rooms", "session_groups", "categories", "staffs", "venue_maps", "sessions",
    "lt_talks", "staff_skills_v2", "staff_preferred_sessions", "staff_availabilities",
    "assignments", "app_settings",
)


def export(source: Path, output: Path) -> None:
    # Validate the exact SQL against the target schema before making it available.
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as reader, \
            sqlite3.connect(":memory:") as target, \
            tempfile.TemporaryFile(mode="w+", encoding="utf-8") as script:
        reader.execute("BEGIN")
        target.execute("PRAGMA foreign_keys=ON")
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            target.executescript(migration.read_text())
        for table in TABLES:
            old = {r[1] for r in reader.execute(f'PRAGMA table_info("{table}")')}
            if not old:
                raise ValueError(f"Missing source table {table}. Open a copy with the current reference app first.")
            columns = [r[1] for r in target.execute(f'PRAGMA table_info("{table}")') if r[1] in old]
            names = ", ".join(f'"{c}"' for c in columns)
            for row in reader.execute(f'SELECT {names} FROM "{table}"'):
                # Encode text as UTF-8 hex to preserve multiline text, NUL and quotes.
                values = [f"CAST(X'{v.encode().hex()}' AS TEXT)" if isinstance(v, str)
                          else reader.execute("SELECT quote(?)", (v,)).fetchone()[0] for v in row]
                sql = f'INSERT INTO "{table}" ({names}) VALUES ({", ".join(values)});'
                target.execute(sql)
                script.write(sql + "\n")
        script.seek(0)
        # Contains credentials and private event data. Never overwrite a previous export.
        import os
        with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as out:
            import shutil
            shutil.copyfileobj(script, out)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sqlite_database", type=Path)
    parser.add_argument("output_sql", type=Path)
    args = parser.parse_args()
    export(args.sqlite_database, args.output_sql)
