-- Keep the previous five versions of each key for selective recovery.
-- Triggers run in the same SQLite transaction as the guarded mutation.
CREATE TABLE IF NOT EXISTS promo_store_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER NOT NULL,
  operation TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS promo_store_history_key_id ON promo_store_history (k, id DESC);

CREATE TRIGGER IF NOT EXISTS promo_store_archive_update
AFTER UPDATE ON promo_store
BEGIN
  INSERT INTO promo_store_history (k, v, updated_at, archived_at, operation)
  VALUES (OLD.k, OLD.v, OLD.updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'UPDATE');
  DELETE FROM promo_store_history
  WHERE k = OLD.k
    AND id NOT IN (
      SELECT id FROM promo_store_history WHERE k = OLD.k ORDER BY id DESC LIMIT 5
    );
END;

CREATE TRIGGER IF NOT EXISTS promo_store_archive_delete
AFTER DELETE ON promo_store
BEGIN
  INSERT INTO promo_store_history (k, v, updated_at, archived_at, operation)
  VALUES (OLD.k, OLD.v, OLD.updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'DELETE');
  DELETE FROM promo_store_history
  WHERE k = OLD.k
    AND id NOT IN (
      SELECT id FROM promo_store_history WHERE k = OLD.k ORDER BY id DESC LIMIT 5
    );
END;
