-- MarkoDoc schema. Run once on startup via db/index.ts.

CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  vendor      TEXT,
  tier        TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'commercial')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
  content_text TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  http_status  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_snapshots_doc ON snapshots(document_id, fetched_at);

CREATE TABLE IF NOT EXISTS changes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id     INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  from_snapshot_id INTEGER REFERENCES snapshots(id),
  to_snapshot_id  INTEGER NOT NULL REFERENCES snapshots(id),
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  summary         TEXT NOT NULL,
  diff_text       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_changes_doc ON changes(document_id, detected_at);

CREATE TABLE IF NOT EXISTS findings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id   INTEGER NOT NULL REFERENCES changes(id) ON DELETE CASCADE,
  framework   TEXT NOT NULL,
  rule_code   TEXT NOT NULL,
  severity    TEXT NOT NULL,
  title       TEXT NOT NULL,
  explanation TEXT NOT NULL,
  excerpt     TEXT,
  confidence  REAL NOT NULL DEFAULT 0.5
);
CREATE INDEX IF NOT EXISTS idx_findings_change ON findings(change_id);

-- Organisation-defined rules (commercial tier).
CREATE TABLE IF NOT EXISTS custom_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT NOT NULL,
  description TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);
