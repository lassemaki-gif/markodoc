import { classifyChange } from "../classify/classifier.js";
import { fetchTerms } from "../capture/fetcher.js";
import { diffSnapshots } from "../diff/differ.js";
import {
  findingsForChange,
  getDocument,
  insertSnapshot,
  latestSnapshot,
  listDocuments,
  recordChange,
  touchLastChecked,
} from "../db/index.js";
import type { ChangeRecord, MonitoredDocument } from "../types.js";
import { notify } from "../notify/index.js";

export type CheckOutcome =
  | { status: "first_snapshot"; document: MonitoredDocument }
  | { status: "unchanged"; document: MonitoredDocument }
  | { status: "changed"; document: MonitoredDocument; change: ChangeRecord }
  | { status: "error"; document: MonitoredDocument; error: string };

/**
 * Run one monitoring cycle for a single document:
 * fetch → hash compare → diff → classify → persist.
 */
export async function checkDocument(id: number): Promise<CheckOutcome> {
  const doc = getDocument(id);
  if (!doc) throw new Error(`No document with id ${id}`);

  try {
    const fetched = await fetchTerms(doc.url);
    const previous = latestSnapshot(doc.id);

    // No change since last time → store nothing, report unchanged.
    if (previous && previous.content_hash === fetched.contentHash) {
      return { status: "unchanged", document: doc };
    }

    const snapshot = insertSnapshot({
      documentId: doc.id,
      contentText: fetched.contentText,
      contentHash: fetched.contentHash,
      httpStatus: fetched.httpStatus,
    });

    // First time we have ever seen this document — baseline only.
    if (!previous) {
      return { status: "first_snapshot", document: doc };
    }

    const diff = diffSnapshots(previous.content_text, fetched.contentText);
    if (!diff.hasChanges) {
      // Hash differed but text is effectively the same after normalisation.
      return { status: "unchanged", document: doc };
    }

    const classification = await classifyChange(doc, diff.diffText);

    const change = recordChange(
      {
        documentId: doc.id,
        fromSnapshotId: previous.id,
        toSnapshotId: snapshot.id,
        summary: classification.summary,
        diffText: diff.diffText,
      },
      classification.findings,
    );

    notify({
      document: doc,
      summary: classification.summary,
      findings: findingsForChange(change.id),
    }).catch(() => {});

    return { status: "changed", document: doc, change };
  } catch (err) {
    return {
      status: "error",
      document: doc,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    touchLastChecked(doc.id);
  }
}

/** Check every active document, sequentially to stay polite to servers. */
export async function checkAll(): Promise<CheckOutcome[]> {
  const outcomes: CheckOutcome[] = [];
  for (const doc of listDocuments()) {
    outcomes.push(await checkDocument(doc.id));
  }
  return outcomes;
}
