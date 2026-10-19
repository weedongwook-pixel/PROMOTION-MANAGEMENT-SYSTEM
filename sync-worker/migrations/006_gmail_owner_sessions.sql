-- Browser-bound Gmail consent and owner-only email authorization.
CREATE TABLE email_owner_attempts (
 state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, verifier_cipher TEXT NOT NULL,
 expires_at INTEGER NOT NULL, generation INTEGER NOT NULL, consumed_at INTEGER,
 requester_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX email_owner_attempts_rate ON email_owner_attempts(requester_hash,created_at);
CREATE TABLE email_owner_sessions (
 session_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, generation INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE email_owner_commit_guard (id INTEGER PRIMARY KEY CHECK(id=1));
