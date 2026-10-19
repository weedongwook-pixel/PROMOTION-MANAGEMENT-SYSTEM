-- Preserve the legacy mode column for existing deployments and readers.
-- delivery_mode is authoritative for new code; old policies remain test-only.
ALTER TABLE email_threads ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'test' CHECK(delivery_mode IN ('test','production'));
