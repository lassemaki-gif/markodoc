import type { Finding, MonitoredDocument } from "../types.js";
import { notifyWebhook } from "./webhook.js";
import { sendEmail } from "./email.js";

export interface NotifyPayload {
  document: MonitoredDocument;
  summary: string;
  findings: Finding[];
}

export async function notify(payload: NotifyPayload): Promise<void> {
  await Promise.allSettled([
    notifyWebhook(payload),
    sendEmail(payload),
  ]);
}
