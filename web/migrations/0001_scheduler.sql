-- Initial schema, translated from app/models.py.
--
-- Notes on the SQLAlchemy -> D1 translation:
--   * DateTime columns become TEXT holding ISO-8601 strings. SQLite has no
--     native date type; SQLAlchemy was already storing text here.
--   * "order" is a SQLite reserved word and must stay quoted everywhere.
--   * Integer primary keys are declared INTEGER PRIMARY KEY AUTOINCREMENT so
--     that meta.last_row_id keeps working the way session.flush() used to.

CREATE TABLE IF NOT EXISTS rooms (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT    NOT NULL,
    capacity INTEGER NOT NULL,
    floor    INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS session_groups (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    label   TEXT    NOT NULL,
    date    TEXT    DEFAULT '',
    "order" INTEGER DEFAULT 0,
    color   TEXT    NOT NULL DEFAULT '#1a73e8'
);

CREATE TABLE IF NOT EXISTS venue_maps (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    title   TEXT    NOT NULL,
    image   TEXT    NOT NULL,
    "order" INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staffs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT    NOT NULL,
    slack_name        TEXT    DEFAULT '',
    photo             TEXT    DEFAULT '',
    english_ok        INTEGER DEFAULT 0,
    role              TEXT    DEFAULT 'general',
    max_hours         INTEGER DEFAULT 8,
    experience_count  INTEGER DEFAULT 0,
    emergency_contact TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT    NOT NULL,
    description      TEXT    DEFAULT '',
    notes            TEXT    DEFAULT '',
    speaker          TEXT    NOT NULL,
    speaker_kana     TEXT    DEFAULT '',
    speaker_photo    TEXT    DEFAULT '',
    speaker_org      TEXT    DEFAULT '',
    speaker_title    TEXT    DEFAULT '',
    speaker_profile  TEXT    DEFAULT '',
    start_time       TEXT    NOT NULL,
    end_time         TEXT    NOT NULL,
    room_id          INTEGER NOT NULL REFERENCES rooms(id),
    required_staff   INTEGER DEFAULT 1,
    category         TEXT    DEFAULT 'general',
    english_required INTEGER DEFAULT 0,
    group_id         INTEGER REFERENCES session_groups(id)
);

CREATE TABLE IF NOT EXISTS lt_talks (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    title             TEXT    NOT NULL,
    speaker           TEXT    NOT NULL,
    speaker_kana      TEXT    DEFAULT '',
    speaker_org       TEXT    DEFAULT '',
    speaker_title     TEXT    DEFAULT '',
    speaker_photo     TEXT    DEFAULT '',
    start_time        TEXT    DEFAULT '',
    end_time          TEXT    DEFAULT '',
    "order"           INTEGER DEFAULT 0,
    is_representative INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff_skills_v2 (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
    skill    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_preferred_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id   INTEGER NOT NULL REFERENCES staffs(id)   ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    priority   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS staff_availabilities (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id   INTEGER NOT NULL REFERENCES staffs(id) ON DELETE CASCADE,
    start_time TEXT    NOT NULL,
    end_time   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    staff_id   INTEGER NOT NULL REFERENCES staffs(id)   ON DELETE CASCADE,
    role       TEXT    DEFAULT 'support'
);

CREATE TABLE IF NOT EXISTS categories (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    key     TEXT    NOT NULL UNIQUE,
    label   TEXT    NOT NULL,
    color   TEXT    NOT NULL DEFAULT '#607d8b',
    "order" INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

-- Foreign-key lookups that the ORM relationships used to hide.
CREATE INDEX IF NOT EXISTS idx_sessions_room_id      ON sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_sessions_group_id     ON sessions(group_id);
CREATE INDEX IF NOT EXISTS idx_sessions_category     ON sessions(category);
CREATE INDEX IF NOT EXISTS idx_lt_talks_session_id   ON lt_talks(session_id);
CREATE INDEX IF NOT EXISTS idx_skills_staff_id       ON staff_skills_v2(staff_id);
CREATE INDEX IF NOT EXISTS idx_prefs_staff_id        ON staff_preferred_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_prefs_session_id      ON staff_preferred_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_avail_staff_id        ON staff_availabilities(staff_id);
CREATE INDEX IF NOT EXISTS idx_assignments_session   ON assignments(session_id);
CREATE INDEX IF NOT EXISTS idx_assignments_staff     ON assignments(staff_id);
