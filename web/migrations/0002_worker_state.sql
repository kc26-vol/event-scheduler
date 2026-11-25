CREATE TABLE scheduler_revision (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL CHECK (version >= 0)
);
INSERT INTO scheduler_revision VALUES (1, 0);

CREATE TABLE login_attempts (ip TEXT NOT NULL, attempted_at INTEGER NOT NULL, failed INTEGER NOT NULL DEFAULT 1);
CREATE INDEX login_attempts_by_ip ON login_attempts(ip, attempted_at);
CREATE TABLE archives (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, created_at TEXT NOT NULL,
    object_key TEXT NOT NULL, size_bytes INTEGER NOT NULL, session_count INTEGER, trigger TEXT
);
CREATE INDEX archives_by_kind ON archives(kind, created_at);
