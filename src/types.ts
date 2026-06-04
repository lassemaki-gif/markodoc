export type Tier = "free" | "commercial";

export type Framework = "gdpr" | "eu_ai_act" | "data_transfer" | "custom";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface MonitoredDocument {
  id: number;
  url: string;
  name: string;
  vendor: string | null;
  tier: Tier;
  active: number; // 0 | 1 (SQLite has no boolean)
  created_at: string;
  check_interval_minutes: number | null; // null = use global default
  last_checked_at: string | null;
}

export interface Snapshot {
  id: number;
  document_id: number;
  fetched_at: string;
  content_text: string;
  content_hash: string;
  http_status: number | null;
}

export interface ChangeRecord {
  id: number;
  document_id: number;
  from_snapshot_id: number | null;
  to_snapshot_id: number;
  detected_at: string;
  summary: string;
  diff_text: string;
}

export interface Finding {
  id: number;
  change_id: number;
  framework: Framework;
  rule_code: string;
  severity: Severity;
  title: string;
  explanation: string;
  excerpt: string | null;
  confidence: number; // 0..1
}

/** A finding as produced by a classifier, before it is persisted. */
export type DraftFinding = Omit<Finding, "id" | "change_id">;
