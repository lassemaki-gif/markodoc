import type { DraftFinding } from "../types.js";
import { FRAMEWORK_RULES } from "./rules.js";
import type {
  ClassificationInput,
  ClassificationResult,
  LlmProvider,
} from "./provider.js";

/**
 * Keyword-based fallback so the whole pipeline runs end-to-end without an LLM
 * key. It is intentionally crude — it exists for local development and tests,
 * not for production accuracy. Swap GeminiProvider in by setting GEMINI_API_KEY.
 */
const KEYWORDS: Record<string, string[]> = {
  "DT-RESIDENCY": ["united states", "u.s.", "usa", "data center", "region", "stored in"],
  "DT-SUBPROCESSOR": ["sub-processor", "subprocessor", "third party", "third-party", "provider"],
  "DT-MECHANISM": ["standard contractual clauses", "scc", "adequacy", "data privacy framework"],
  "GDPR-PURPOSE": ["purpose", "marketing", "profiling", "improve our services"],
  "GDPR-TRAINING": ["train", "training", "machine learning", "model improvement"],
  "GDPR-RETENTION": ["retain", "retention", "store your data", "delete"],
  "GDPR-RIGHTS": ["access", "erasure", "portability", "object to"],
  "AIA-ROLE": ["provider", "deployer", "responsib"],
  "AIA-TRANSPARENCY": ["automated decision", "ai-generated", "disclose"],
  "AIA-HUMAN-OVERSIGHT": ["human review", "human oversight", "human-in-the-loop"],
};

export class MockProvider implements LlmProvider {
  readonly name = "mock";

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const added = input.diffText
      .split("\n")
      .filter((l) => l.startsWith("+ ")).length;
    const removed = input.diffText
      .split("\n")
      .filter((l) => l.startsWith("- ")).length;

    const summary = `Detected ${added} added and ${removed} removed line(s) in the terms for ${input.documentName}. (Offline heuristic summary — set GEMINI_API_KEY for a real analysis.)`;

    if (input.tier === "free") return { summary, findings: [] };

    const lower = input.diffText.toLowerCase();
    const findings: DraftFinding[] = [];

    for (const rule of FRAMEWORK_RULES) {
      const kws = KEYWORDS[rule.code] ?? [];
      const hit = kws.find((kw) => lower.includes(kw));
      if (!hit) continue;
      const excerpt =
        input.diffText
          .split("\n")
          .find((l) => l.toLowerCase().includes(hit)) ?? null;
      findings.push({
        framework: rule.framework,
        rule_code: rule.code,
        severity: rule.framework === "data_transfer" ? "high" : "medium",
        title: rule.title,
        explanation: `Heuristic match on "${hit}". Review the change manually.`,
        excerpt,
        confidence: 0.4,
      });
    }

    return { summary, findings };
  }
}
