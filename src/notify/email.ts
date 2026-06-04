import nodemailer from "nodemailer";
import { config } from "../config.js";
import type { Finding, MonitoredDocument } from "../types.js";

const SEV_COLORS: Record<string, string> = {
  critical: "#c0392b",
  high: "#e67e22",
  medium: "#f1c40f",
  low: "#27ae60",
  info: "#2980b9",
};

function buildHtml(doc: MonitoredDocument, summary: string, findings: Finding[]): string {
  const rows = findings
    .map((f) => `
      <tr>
        <td style="padding:6px 10px;white-space:nowrap">
          <span style="background:${SEV_COLORS[f.severity] ?? "#888"};color:#fff;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;text-transform:uppercase">${f.severity}</span>
        </td>
        <td style="padding:6px 10px;font-weight:600">${f.title}</td>
        <td style="padding:6px 10px;color:#555;font-size:13px">${f.framework} · ${f.rule_code}</td>
        <td style="padding:6px 10px;color:#777;font-size:12px">${Math.round(f.confidence * 100)}%</td>
      </tr>
      ${f.excerpt ? `<tr><td colspan="4" style="padding:0 10px 10px 10px"><code style="background:#f5f5f5;padding:6px 10px;border-radius:3px;font-size:12px;display:block;border-left:3px solid #ddd">${f.excerpt}</code></td></tr>` : ""}
    `).join("");

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#222;max-width:680px;margin:0 auto;padding:24px">
  <div style="border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:24px">
    <span style="font-family:monospace;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">MarkoDoc</span>
    <span style="font-family:monospace;font-size:12px;color:#888;margin-left:16px">change detected</span>
  </div>
  <h2 style="margin:0 0 4px;font-size:22px">${doc.name}</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;font-family:monospace">${doc.url}</p>
  <p style="background:#f8f8f8;border-left:3px solid #222;padding:12px 16px;margin:0 0 24px;font-size:14px;line-height:1.6">${summary}</p>
  ${rows ? `
  <h3 style="font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:#888;margin:0 0 8px">Findings</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>` : ""}
  <p style="margin-top:32px;font-size:12px;color:#aaa;border-top:1px solid #eee;padding-top:16px">Sent by MarkoDoc — <a href="http://localhost:${config.port}" style="color:#aaa">open dashboard</a></p>
</body></html>`;
}

export async function sendEmail(payload: {
  document: MonitoredDocument;
  summary: string;
  findings: Finding[];
}): Promise<void> {
  if (!config.smtpHost || !config.notifyEmailTo) return;

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
  });

  await transporter.sendMail({
    from: config.smtpFrom,
    to: config.notifyEmailTo,
    subject: `[MarkoDoc] Change detected: ${payload.document.name}`,
    html: buildHtml(payload.document, payload.summary, payload.findings),
  });
}
