import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type {
  ChangeRecord,
  DraftFinding,
  Finding,
  MonitoredDocument,
  Snapshot,
  Tier,
} from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(config.dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  const schema = readFileSync(join(__dirname, "schema.sql"), "utf8");
  _db.exec(schema);
  migrate(_db);
  return _db;
}

function migrate(database: Database.Database): void {
  const cols = [
    `ALTER TABLE documents ADD COLUMN check_interval_minutes INTEGER`,
    `ALTER TABLE documents ADD COLUMN last_checked_at TEXT`,
  ];
  for (const sql of cols) {
    try { database.exec(sql); } catch { /* column already exists */ }
  }
}

// --- documents ---------------------------------------------------------------

export function addDocument(input: {
  url: string;
  name: string;
  vendor?: string | null;
  tier: Tier;
  check_interval_minutes?: number | null;
}): MonitoredDocument {
  const stmt = db().prepare(
    `INSERT INTO documents (url, name, vendor, tier, check_interval_minutes)
     VALUES (@url, @name, @vendor, @tier, @check_interval_minutes)`,
  );
  const info = stmt.run({
    url: input.url,
    name: input.name,
    vendor: input.vendor ?? null,
    tier: input.tier,
    check_interval_minutes: input.check_interval_minutes ?? null,
  });
  return getDocument(Number(info.lastInsertRowid))!;
}

export function updateDocument(
  id: number,
  patch: Partial<{ name: string; vendor: string | null; tier: Tier; check_interval_minutes: number | null }>,
): MonitoredDocument | undefined {
  const fields = Object.keys(patch)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  if (!fields) return getDocument(id);
  db().prepare(`UPDATE documents SET ${fields} WHERE id = @id`).run({ ...patch, id });
  return getDocument(id);
}

export function touchLastChecked(id: number): void {
  db().prepare(`UPDATE documents SET last_checked_at = datetime('now') WHERE id = ?`).run(id);
}

export function listDocumentsDue(globalIntervalMinutes: number): MonitoredDocument[] {
  return db().prepare(`
    SELECT * FROM documents
    WHERE active = 1
    AND (
      last_checked_at IS NULL
      OR CAST((julianday('now') - julianday(last_checked_at)) * 1440 AS INTEGER)
         >= COALESCE(check_interval_minutes, ?)
    )
    ORDER BY id
  `).all(globalIntervalMinutes) as MonitoredDocument[];
}

export function getDocument(id: number): MonitoredDocument | undefined {
  return db()
    .prepare(`SELECT * FROM documents WHERE id = ?`)
    .get(id) as MonitoredDocument | undefined;
}

export function getDocumentByUrl(url: string): MonitoredDocument | undefined {
  return db()
    .prepare(`SELECT * FROM documents WHERE url = ?`)
    .get(url) as MonitoredDocument | undefined;
}

export function listDocuments(includeInactive = false): MonitoredDocument[] {
  const where = includeInactive ? "" : "WHERE active = 1";
  return db()
    .prepare(`SELECT * FROM documents ${where} ORDER BY id`)
    .all() as MonitoredDocument[];
}

// --- snapshots ---------------------------------------------------------------

export function latestSnapshot(documentId: number): Snapshot | undefined {
  return db()
    .prepare(
      `SELECT * FROM snapshots WHERE document_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(documentId) as Snapshot | undefined;
}

export function insertSnapshot(input: {
  documentId: number;
  contentText: string;
  contentHash: string;
  httpStatus: number | null;
}): Snapshot {
  const info = db()
    .prepare(
      `INSERT INTO snapshots (document_id, content_text, content_hash, http_status)
       VALUES (@documentId, @contentText, @contentHash, @httpStatus)`,
    )
    .run(input);
  return db()
    .prepare(`SELECT * FROM snapshots WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as Snapshot;
}

// --- changes + findings ------------------------------------------------------

export function recordChange(
  input: {
    documentId: number;
    fromSnapshotId: number | null;
    toSnapshotId: number;
    summary: string;
    diffText: string;
  },
  findings: DraftFinding[],
): ChangeRecord {
  const tx = db().transaction(() => {
    const info = db()
      .prepare(
        `INSERT INTO changes (document_id, from_snapshot_id, to_snapshot_id, summary, diff_text)
         VALUES (@documentId, @fromSnapshotId, @toSnapshotId, @summary, @diffText)`,
      )
      .run(input);
    const changeId = Number(info.lastInsertRowid);

    const fstmt = db().prepare(
      `INSERT INTO findings (change_id, framework, rule_code, severity, title, explanation, excerpt, confidence)
       VALUES (@change_id, @framework, @rule_code, @severity, @title, @explanation, @excerpt, @confidence)`,
    );
    for (const f of findings) {
      fstmt.run({ change_id: changeId, ...f });
    }
    return changeId;
  });

  const changeId = tx();
  return db()
    .prepare(`SELECT * FROM changes WHERE id = ?`)
    .get(changeId) as ChangeRecord;
}

export function listChanges(documentId: number): ChangeRecord[] {
  return db()
    .prepare(
      `SELECT * FROM changes WHERE document_id = ? ORDER BY detected_at DESC`,
    )
    .all(documentId) as ChangeRecord[];
}

export function findingsForChange(changeId: number): Finding[] {
  return db()
    .prepare(`SELECT * FROM findings WHERE change_id = ? ORDER BY id`)
    .all(changeId) as Finding[];
}

export function activeCustomRules(): { label: string; description: string }[] {
  return db()
    .prepare(`SELECT label, description FROM custom_rules WHERE active = 1`)
    .all() as { label: string; description: string }[];
}
