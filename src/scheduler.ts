import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { checkDocument } from "./monitor/monitor.js";
import type { CheckOutcome } from "./monitor/monitor.js";
import { listDocumentsDue } from "./db/index.js";

export interface SchedulerHandle {
  /** Trigger a poll cycle immediately (outside the interval). */
  runNow(): Promise<void>;
  /** Stop the interval. */
  stop(): void;
}

/**
 * Poll every monitored document on a fixed interval. A cycle never overlaps
 * itself: if a previous cycle is still running when the timer fires, the tick
 * is skipped. Errors in one cycle are logged and do not stop the scheduler.
 */
export function startScheduler(
  intervalMinutes: number,
  onCycle?: (outcomes: CheckOutcome[]) => void,
): SchedulerHandle {
  let running = false;

  const runOnce = async () => {
    if (running) {
      console.warn("[scheduler] previous cycle still running — skipping tick");
      return;
    }
    running = true;
    const startedAt = Date.now();
    try {
      const due = listDocumentsDue(intervalMinutes);
      if (!due.length) return;
      const outcomes: CheckOutcome[] = [];
      for (const doc of due) outcomes.push(await checkDocument(doc.id));
      onCycle?.(outcomes);
      const changed = outcomes.filter((o) => o.status === "changed").length;
      const errored = outcomes.filter((o) => o.status === "error").length;
      console.log(
        `[scheduler] cycle done in ${Date.now() - startedAt}ms — ` +
          `${outcomes.length} checked, ${changed} changed, ${errored} errored`,
      );
    } catch (err) {
      console.error("[scheduler] cycle failed:", err);
    } finally {
      running = false;
    }
  };

  // Tick every minute; each tick decides which documents are due.
  void runOnce();
  const timer = setInterval(() => void runOnce(), 60_000);

  return {
    runNow: runOnce,
    stop: () => clearInterval(timer),
  };
}

/** True when this module is the process entry point (run directly). */
function isMain(metaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === fileURLToPath(metaUrl);
  } catch {
    return false;
  }
}

// `npm run schedule` — run the poller continuously until interrupted.
if (isMain(import.meta.url)) {
  const minutes = config.pollIntervalMinutes;
  console.log(
    `[scheduler] starting — polling every ${minutes} minute(s). Ctrl-C to stop.`,
  );
  const handle = startScheduler(minutes);
  process.on("SIGINT", () => {
    console.log("\n[scheduler] stopping.");
    handle.stop();
    process.exit(0);
  });
}
