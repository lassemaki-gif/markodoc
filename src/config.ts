import "dotenv/config";

/**
 * Environment-driven configuration. Copy .env.example to .env to override.
 * Nothing here is required: with no GEMINI_API_KEY the offline classifier runs.
 */
export const config = {
  /** SQLite file path. Swap for a Postgres layer when going multi-tenant. */
  dbPath: process.env.MARKODOC_DB ?? "./markodoc.db",
  /** Host to bind to. Defaults to 0.0.0.0 for container/cloud deployments. */
  host: process.env.HOST ?? "0.0.0.0",
  /** If set, the dashboard requires a password to access. */
  password: process.env.MARKODOC_PASSWORD ?? "",
  /** Default tier applied to newly added documents unless overridden. */
  defaultTier: process.env.MARKODOC_DEFAULT_TIER ?? "free",
  /** Abort a terms fetch after this many ms. */
  fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 15000),
  /** Web dashboard port. */
  port: Number(process.env.PORT ?? 4000),
  /** Scheduler interval in minutes (used by `npm run schedule` and autopoll). */
  pollIntervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES ?? 1440),
  /** When true, the web server also runs the scheduler in-process. */
  webAutopoll: process.env.WEB_AUTOPOLL === "true",
  /** Optional: enables the Gemini classifier. Empty => offline heuristic. */
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  /** Set to a current Gemini "flash"-class model available on your account. */
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  /** Optional: POST change notifications to this URL. */
  notifyWebhookUrl: process.env.NOTIFY_WEBHOOK_URL ?? "",
  /** Minimum severity to trigger a notification: critical | high | medium | low | info */
  notifyMinSeverity: process.env.NOTIFY_MIN_SEVERITY ?? "high",
  /** SMTP settings for email notifications. */
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? 587),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "MarkoDoc <noreply@markodoc.local>",
  /** Comma-separated list of recipient emails. */
  notifyEmailTo: process.env.NOTIFY_EMAIL_TO ?? "",
  /** Public base URL shown in email footers (e.g. https://markodoc.cloud). */
  baseUrl: process.env.BASE_URL ?? "",
};
