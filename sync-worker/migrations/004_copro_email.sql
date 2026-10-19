-- Protected pilot records. Never synchronize through promo_store.
CREATE TABLE email_actor_permissions (
 tenant_id TEXT NOT NULL, object_id TEXT NOT NULL,
 permission TEXT NOT NULL CHECK(permission IN ('manage','submit','it')),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 PRIMARY KEY(tenant_id,object_id,permission)
);
CREATE TABLE email_threads (
 id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, message_id TEXT NOT NULL,
 rfc_message_id TEXT NOT NULL, references_json TEXT NOT NULL,
 subject TEXT NOT NULL, to_json TEXT NOT NULL, cc_json TEXT NOT NULL,
 audience_json TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
 mode TEXT NOT NULL CHECK(mode='test'), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 published_by TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE email_campaigns (
 id TEXT PRIMARY KEY, campaign_key TEXT NOT NULL, month TEXT NOT NULL,
 submission_id TEXT NOT NULL, owner_tenant TEXT NOT NULL, owner_oid TEXT NOT NULL,
 source_hash TEXT NOT NULL, source_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'active',
 UNIQUE(campaign_key,month,submission_id)
);
CREATE TABLE email_campaign_buttons (
 campaign_id TEXT NOT NULL REFERENCES email_campaigns(id), button_id TEXT NOT NULL,
 source_identity_json TEXT NOT NULL, it_done INTEGER NOT NULL DEFAULT 0,
 it_by TEXT, it_at INTEGER, cancelled INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(campaign_id,button_id)
);
CREATE TABLE email_copro_records (
 id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES email_campaigns(id),
 button_id TEXT NOT NULL, record_json TEXT NOT NULL, interface_done INTEGER NOT NULL DEFAULT 0,
 interface_by TEXT, interface_at INTEGER, version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(campaign_id,button_id)
);
CREATE TABLE email_bindings (
 campaign_id TEXT PRIMARY KEY REFERENCES email_campaigns(id), thread_id TEXT NOT NULL REFERENCES email_threads(id),
 policy_version INTEGER NOT NULL, recipients_json TEXT NOT NULL, content_hash TEXT NOT NULL,
 confirmed_by TEXT NOT NULL, confirmed_at INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE email_outbox (
 id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE,
 campaign_id TEXT NOT NULL REFERENCES email_campaigns(id), binding_version INTEGER NOT NULL,
 snapshot_json TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','sending','accepted','retry','failed','held','needs_verification','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT, lease_until INTEGER, provider_id TEXT, sanitized_error TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX email_outbox_due ON email_outbox(status,next_attempt_at);
CREATE TABLE email_audit (
 id TEXT PRIMARY KEY, campaign_id TEXT, actor TEXT NOT NULL,
 event TEXT NOT NULL, details_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
