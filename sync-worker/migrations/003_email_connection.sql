-- Additive, server-only records. Never expose through promo_store.
CREATE TABLE IF NOT EXISTS email_admin_grants (
  tenant_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, object_id)
);
CREATE TABLE IF NOT EXISTS email_oauth_attempts (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  verifier_cipher TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  generation INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE TABLE IF NOT EXISTS email_connections (
  id INTEGER PRIMARY KEY CHECK(id=1),
  sender TEXT,
  status TEXT NOT NULL,
  refresh_cipher TEXT,
  granted_scopes TEXT,
  connected_at TEXT,
  updated_at TEXT NOT NULL,
  generation INTEGER NOT NULL DEFAULT 0
);
