-- A "new email" loop (email_threads.message_id 'new:...') has no Gmail conversation
-- until its first message is accepted. Record that first message from Gmail so later
-- mail bound to the same loop (edits, extend/shorten/cancel, IT replies) replies in it.
CREATE TABLE IF NOT EXISTS email_thread_starts (
 thread_id TEXT PRIMARY KEY REFERENCES email_threads(id),
 gmail_thread_id TEXT NOT NULL, message_id TEXT NOT NULL, rfc_message_id TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
