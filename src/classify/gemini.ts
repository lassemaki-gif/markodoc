import { config } from "../config.js";
import type { DraftFinding, Framework, Severity } from "../types.js";
import { rulesForPrompt } from "./rules.js";
import type {
  ClassificationInput,
  ClassificationResult,
  LlmProvider,
} from "./provider.js";

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

const VALID_FRAMEWORKS: Framework[] = [
  "gdpr",
  "eu_ai_act",
  "data_transfer",
  "custom",
];
const VALID_SEVERITY: Severity[] = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
];

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model = config.geminiModel,
  ) {}

  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const prompt = buildPrompt(input);
    const res = await fetch(ENDPOINT(this.model, this.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      }),
    });

    if (!res.ok) {
      throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
      "";

    return parseResult(text, input);
  }
}

function buildPrompt(input: ClassificationInput): string {
  const base = `You are a compliance analyst reviewing a change to the terms of use of a SaaS product.
Product: ${input.documentName}${input.vendor ? ` (vendor: ${input.vendor})` : ""}.

Below is the diff of the terms. Lines starting with "+" were added, lines starting with "-" were removed.

DIFF:
${truncate(input.diffText, 12000)}
`;

  if (input.tier === "free") {
    return (
      base +
      `\nWrite a short, neutral, plain-language summary (2-4 sentences) of what changed and why a customer might care. Do not give legal advice.\n\nReturn ONLY JSON of the form:\n{"summary": "..."}`
    );
  }

  const custom =
    input.customRules.length > 0
      ? input.customRules
          .map((r) => `- CUSTOM:${r.label} — ${r.description}`)
          .join("\n")
      : "(none)";

  return (
    base +
    `\nFirst, write a short plain-language summary (2-4 sentences).
Then classify the change against these rules, flagging only those that genuinely apply:

FRAMEWORK RULES:
${rulesForPrompt()}

CUSTOM RULES:
${custom}

For each applicable rule, produce a finding. Severity is one of: info, low, medium, high, critical. Confidence is 0..1. These are advisory signals for human review, not legal conclusions.

Return ONLY JSON of the form:
{
  "summary": "...",
  "findings": [
    {
      "framework": "gdpr|eu_ai_act|data_transfer|custom",
      "rule_code": "e.g. DT-RESIDENCY or CUSTOM:<label>",
      "severity": "info|low|medium|high|critical",
      "title": "short title",
      "explanation": "why this change triggers the rule",
      "excerpt": "the most relevant changed line, or null",
      "confidence": 0.0
    }
  ]
}`
  );
}

function parseResult(
  text: string,
  input: ClassificationInput,
): ClassificationResult {
  const json = extractJson(text);
  const summary =
    typeof json.summary === "string" && json.summary.trim()
      ? json.summary.trim()
      : "Terms changed (no summary returned).";

  if (input.tier === "free" || !Array.isArray(json.findings)) {
    return { summary, findings: [] };
  }

  const findings: DraftFinding[] = [];
  for (const raw of json.findings as Record<string, unknown>[]) {
    const framework = raw.framework as Framework;
    const severity = raw.severity as Severity;
    if (!VALID_FRAMEWORKS.includes(framework)) continue;
    findings.push({
      framework,
      rule_code: String(raw.rule_code ?? "UNKNOWN"),
      severity: VALID_SEVERITY.includes(severity) ? severity : "info",
      title: String(raw.title ?? "Untitled finding"),
      explanation: String(raw.explanation ?? ""),
      excerpt: raw.excerpt == null ? null : String(raw.excerpt),
      confidence: clamp01(Number(raw.confidence ?? 0.5)),
    });
  }
  return { summary, findings };
}

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "\n…(truncated)" : s;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
