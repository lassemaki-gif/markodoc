import type { Framework } from "../types.js";

export interface FrameworkRule {
  framework: Framework;
  code: string;
  title: string;
  /** What a change touching this rule looks like, in plain language. */
  watchFor: string;
}

/**
 * A starter catalogue of things worth flagging when SaaS terms change.
 * This is intentionally compact and advisory — it shapes the LLM prompt and
 * gives findings a stable rule_code. Extend per your compliance programme.
 *
 * NOTE: these are heuristics to surface changes for human review, not legal
 * determinations. See README for the disclaimer.
 */
export const FRAMEWORK_RULES: FrameworkRule[] = [
  // --- Cross-border data transfer (the core MarkoDoc scenario) -------------
  {
    framework: "data_transfer",
    code: "DT-RESIDENCY",
    title: "Data residency / storage location changed",
    watchFor:
      "New mention of storing or processing data in a different country or region, especially a move toward the US or 'global' infrastructure.",
  },
  {
    framework: "data_transfer",
    code: "DT-SUBPROCESSOR",
    title: "Sub-processor or third party added",
    watchFor:
      "A new vendor, cloud provider, analytics or AI provider being added to the chain of processing.",
  },
  {
    framework: "data_transfer",
    code: "DT-MECHANISM",
    title: "Transfer safeguard changed",
    watchFor:
      "Changes to Standard Contractual Clauses, adequacy decisions, Data Privacy Framework, or removal of a transfer safeguard.",
  },

  // --- GDPR ----------------------------------------------------------------
  {
    framework: "gdpr",
    code: "GDPR-PURPOSE",
    title: "Purpose of processing expanded",
    watchFor:
      "New purposes for using personal data, e.g. profiling, marketing, or 'improving our services'.",
  },
  {
    framework: "gdpr",
    code: "GDPR-TRAINING",
    title: "Customer data used to train models",
    watchFor:
      "Terms now permitting use of customer content or personal data to train AI/ML models.",
  },
  {
    framework: "gdpr",
    code: "GDPR-RETENTION",
    title: "Retention period changed",
    watchFor: "Longer data retention, or removal of a deletion commitment.",
  },
  {
    framework: "gdpr",
    code: "GDPR-RIGHTS",
    title: "Data subject rights weakened",
    watchFor:
      "Reduced ability to access, delete, port or object to processing of personal data.",
  },

  // --- EU AI Act -----------------------------------------------------------
  {
    framework: "eu_ai_act",
    code: "AIA-ROLE",
    title: "Provider/deployer responsibilities shifted",
    watchFor:
      "Terms reassigning obligations between provider and deployer, or disclaiming AI Act duties.",
  },
  {
    framework: "eu_ai_act",
    code: "AIA-TRANSPARENCY",
    title: "AI transparency / disclosure changed",
    watchFor:
      "Changes to disclosures about automated decision-making, AI-generated content, or system capabilities and limits.",
  },
  {
    framework: "eu_ai_act",
    code: "AIA-HUMAN-OVERSIGHT",
    title: "Human oversight commitments changed",
    watchFor:
      "Removal or weakening of human-in-the-loop guarantees for higher-risk uses.",
  },
];

export function rulesForPrompt(): string {
  return FRAMEWORK_RULES.map(
    (r) => `- ${r.code} (${r.framework}) — ${r.title}: ${r.watchFor}`,
  ).join("\n");
}
