import { config } from "../config.js";
import { activeCustomRules } from "../db/index.js";
import type { MonitoredDocument } from "../types.js";
import { GeminiProvider } from "./gemini.js";
import { MockProvider } from "./mock.js";
import type {
  ClassificationResult,
  LlmProvider,
} from "./provider.js";

export function getProvider(): LlmProvider {
  if (config.geminiApiKey) return new GeminiProvider(config.geminiApiKey);
  return new MockProvider();
}

/**
 * Classify a change for a document according to its tier.
 *  - free:       summary only
 *  - commercial: summary + framework/custom findings
 */
export async function classifyChange(
  doc: MonitoredDocument,
  diffText: string,
): Promise<ClassificationResult> {
  const provider = getProvider();
  return provider.classify({
    documentName: doc.name,
    vendor: doc.vendor,
    diffText,
    tier: doc.tier,
    customRules: doc.tier === "commercial" ? activeCustomRules() : [],
  });
}
