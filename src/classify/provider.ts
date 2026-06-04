import type { DraftFinding, Tier } from "../types.js";

export interface ClassificationInput {
  documentName: string;
  vendor: string | null;
  /** Only the changed lines, prefixed with + / -. */
  diffText: string;
  /** Free = summarise only. Commercial = summarise + map to frameworks. */
  tier: Tier;
  /** Extra organisation-defined things to watch for (commercial). */
  customRules: { label: string; description: string }[];
}

export interface ClassificationResult {
  /** Plain-language summary of what changed. Always produced. */
  summary: string;
  /** Framework/custom findings. Empty for the free tier. */
  findings: DraftFinding[];
}

export interface LlmProvider {
  readonly name: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
}
