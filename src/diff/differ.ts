import { diffLines } from "diff";

export interface DiffSummary {
  /** Unified-ish text diff, useful for display and as LLM input. */
  diffText: string;
  added: number;
  removed: number;
  hasChanges: boolean;
}

/**
 * Produce a line-level diff between the previous and current terms text.
 * Returns only the changed regions to keep the LLM prompt small and focused.
 */
export function diffSnapshots(previous: string, current: string): DiffSummary {
  const parts = diffLines(previous, current);
  const lines: string[] = [];
  let added = 0;
  let removed = 0;

  for (const part of parts) {
    if (!part.added && !part.removed) continue;
    const prefix = part.added ? "+ " : "- ";
    const partLines = part.value.split("\n").filter((l) => l.trim().length > 0);
    for (const l of partLines) {
      lines.push(prefix + l);
      if (part.added) added++;
      else removed++;
    }
  }

  return {
    diffText: lines.join("\n"),
    added,
    removed,
    hasChanges: lines.length > 0,
  };
}
