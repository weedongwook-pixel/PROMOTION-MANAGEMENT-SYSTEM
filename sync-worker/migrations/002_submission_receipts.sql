-- Immutable, server-side evidence for Cloud-first form submissions.
-- A failed transaction must not leave either campaign rows or a receipt behind.
CREATE TABLE IF NOT EXISTS promo_submission_receipts (
  submission_id TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  expected_buttons INTEGER NOT NULL CHECK (expected_buttons >= 0),
  created_at INTEGER NOT NULL
);

-- Used only inside one D1 batch to turn a zero-row compare-and-swap into an
-- abort. The CHECK failure rolls the entire batch back, including the receipt.
CREATE TABLE IF NOT EXISTS promo_commit_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);
