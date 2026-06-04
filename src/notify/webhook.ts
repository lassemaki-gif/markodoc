import { config } from "../config.js";
import type { Finding, MonitoredDocument } from "../types.js";

const SEV_ORDER = ["critical", "high", "medium", "low", "info"];

function severityMeets(actual: string, minimum: string): boolean {
  return SEV_ORDER.indexOf(actual) <= SEV_ORDER.indexOf(minimum);
}

export interface NotifyPayload {
  document: MonitoredDocument;
  summary: string;
  findings: Finding[];
  diffUrl?: string;
}

export async function notifyWebhook(payload: NotifyPayload): Promise<void> {
  if (!config.notifyWebhookUrl) return;

  const topFindings = payload.findings.filter((f) =>
    severityMeets(f.severity, config.notifyMinSeverity),
  );
  if (payload.findings.length > 0 && topFindings.length === 0) return;

  const body = {
    document: {
      id: payload.document.id,
      name: payload.document.name,
      vendor: payload.document.vendor,
      url: payload.document.url,
      tier: payload.document.tier,
    },
    summary: payload.summary,
    findings: topFindings,
    detected_at: new Date().toISOString(),
  };

  try {
    await fetch(config.notifyWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[notify] webhook failed:", err instanceof Error ? err.message : err);
  }
}
