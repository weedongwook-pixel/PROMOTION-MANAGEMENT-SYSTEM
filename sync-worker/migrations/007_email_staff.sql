-- Private mail authorization: never stored in browser-editable promo_store.
CREATE TABLE email_staff (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
 site_role TEXT NOT NULL DEFAULT 'MKT', password_salt TEXT, password_hash TEXT, ms_oid TEXT UNIQUE, ms_tenant TEXT,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN(0,1)),
 can_send INTEGER NOT NULL DEFAULT 0 CHECK(can_send IN(0,1)),
 can_it INTEGER NOT NULL DEFAULT 0 CHECK(can_it IN(0,1)),
 version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE email_staff_sessions (
 session_hash TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES email_staff(id),
 version INTEGER NOT NULL, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX email_staff_sessions_expiry ON email_staff_sessions(expires_at);
CREATE TABLE email_staff_challenges (
 nonce_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE email_staff_requests (
 ms_oid TEXT PRIMARY KEY, ms_tenant TEXT NOT NULL, display_name TEXT NOT NULL,
 email_label TEXT NOT NULL, requested_at INTEGER NOT NULL
);
CREATE TABLE email_staff_rate (
 rate_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
