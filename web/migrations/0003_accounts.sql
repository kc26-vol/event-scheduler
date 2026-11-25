-- Login records are separate from the event roster and its downloadable backups.
CREATE TABLE login_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('staff','admin')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
    staff_id INTEGER UNIQUE REFERENCES staffs(id) ON DELETE SET NULL
);

CREATE TABLE login_identities (
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    account_id INTEGER NOT NULL UNIQUE REFERENCES login_accounts(id) ON DELETE CASCADE,
    PRIMARY KEY(provider,subject)
);

CREATE TABLE login_links (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL UNIQUE REFERENCES login_accounts(id) ON DELETE CASCADE,
    sent_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

CREATE TABLE login_sessions (
    token_hash TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES login_accounts(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK(purpose IN ('login','enroll')),
    expires_at INTEGER NOT NULL
);
CREATE INDEX login_sessions_account ON login_sessions(account_id);
CREATE INDEX login_sessions_expiry ON login_sessions(expires_at);

CREATE TABLE login_oauth (
    state_hash TEXT PRIMARY KEY,
    browser_hash TEXT NOT NULL,
    nonce TEXT NOT NULL,
    enrollment_hash TEXT,
    expires_at INTEGER NOT NULL
);
CREATE INDEX login_oauth_expiry ON login_oauth(expires_at);
