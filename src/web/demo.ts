import { classifyChange } from "../classify/classifier.js";
import {
  addDocument,
  findingsForChange,
  getDocumentByUrl,
  insertSnapshot,
  recordChange,
} from "../db/index.js";
import { diffSnapshots } from "../diff/differ.js";
import type { ChangeRecord, Finding, MonitoredDocument } from "../types.js";

const DEMO_URL = "demo://acme-ai/terms";

/**
 * Baseline terms: EU-only data residency, no model training, single EU
 * sub-processor, full data-subject rights, 12-month retention.
 */
const V1 = [
  "Data Processing.",
  "We process your personal data within the European Union.",
  "All customer data is stored in data centres located in Frankfurt, Germany.",
  "We do not use your content to train our models.",
  "We engage the following sub-processors: Hetzner (hosting, Germany).",
  "You may request access to or erasure of your personal data at any time.",
  "We retain your data for 12 months after account closure.",
].join("\n");

/**
 * Updated terms with several compliance-relevant shifts: data moves to the US,
 * content is now used for model training, a US sub-processor is added, rights
 * are narrowed, and retention is extended.
 */
const V2 = [
  "Data Processing.",
  "We process your personal data globally.",
  "Customer data may be stored and processed in the United States and other regions.",
  "We may use your content and usage data to train and improve our machine learning models.",
  "We engage the following sub-processors: Hetzner (hosting, Germany) and a third-party analytics provider based in the United States.",
  "You may request access to your personal data.",
  "We retain your data for 36 months after account closure.",
].join("\n");

export interface DemoResult {
  document: MonitoredDocument;
  change: ChangeRecord;
  findings: Finding[];
}

/**
 * Run the whole pipeline offline against two bundled sample versions, so the
 * classify → findings flow is visible without fetching anything over the
 * network. Uses the same diff + classifier code path as real monitoring.
 */
export async function runDemo(): Promise<DemoResult> {
  const document =
    getDocumentByUrl(DEMO_URL) ??
    addDocument({
      url: DEMO_URL,
      name: "Acme AI (demo)",
      vendor: "Acme Inc",
      tier: "commercial",
    });

  const baseline = insertSnapshot({
    documentId: document.id,
    contentText: V1,
    contentHash: "demo-v1",
    httpStatus: 200,
  });
  const updated = insertSnapshot({
    documentId: document.id,
    contentText: V2,
    contentHash: "demo-v2",
    httpStatus: 200,
  });

  const diff = diffSnapshots(V1, V2);
  const classification = await classifyChange(document, diff.diffText);

  const change = recordChange(
    {
      documentId: document.id,
      fromSnapshotId: baseline.id,
      toSnapshotId: updated.id,
      summary: classification.summary,
      diffText: diff.diffText,
    },
    classification.findings,
  );

  return { document, change, findings: findingsForChange(change.id) };
}
