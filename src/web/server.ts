import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { getProvider } from "../classify/classifier.js";
import {
  addDocument,
  findingsForChange,
  getDocumentByUrl,
  insertSnapshot,
  listChanges,
  listDocuments,
  recordChange,
  updateDocument,
} from "../db/index.js";
import { htmlToText } from "../capture/fetcher.js";
import { checkAll, checkDocument } from "../monitor/monitor.js";
import type { CheckOutcome } from "../monitor/monitor.js";
import { startScheduler } from "../scheduler.js";
import { runDemo } from "./demo.js";
import type { Tier } from "../types.js";
import { fetchTerms } from "../capture/fetcher.js";
import { diffSnapshots } from "../diff/differ.js";
import { classifyChange } from "../classify/classifier.js";
import { notify } from "../notify/index.js";

const INDEX_HTML = fileURLToPath(new URL("./index.html", import.meta.url));
const LOGIN_HTML = fileURLToPath(new URL("./login.html", import.meta.url));

// --- auth -------------------------------------------------------------------

function sessionToken(): string {
  return createHmac("sha256", config.password).update("markodoc-v1").digest("hex");
}

function getCookie(req: IncomingMessage, name: string): string | undefined {
  return req.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(name + "="))
    ?.slice(name.length + 1);
}

function isAuthenticated(req: IncomingMessage): boolean {
  if (!config.password) return true;
  return getCookie(req, "md_session") === sessionToken();
}

async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString()).entries());
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

/** Flatten a monitor outcome into something the browser can render. */
function serializeOutcome(o: CheckOutcome) {
  const base = { id: o.document.id, name: o.document.name, status: o.status };
  if (o.status === "changed") {
    return {
      ...base,
      change_id: o.change.id,
      summary: o.change.summary,
      diff: o.change.diff_text,
      findings: findingsForChange(o.change.id),
    };
  }
  if (o.status === "error") return { ...base, error: o.error };
  return base;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";

  // --- auth ---------------------------------------------------------------
  if (method === "POST" && path === "/auth/login") {
    const form = await readForm(req);
    if (form.password && form.password === config.password) {
      const cookie = `md_session=${sessionToken()}; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/`;
      res.writeHead(303, { "Set-Cookie": cookie, Location: "/" });
      res.end();
    } else {
      const html = readFileSync(LOGIN_HTML, "utf8").replace("<!--ERROR-->",
        '<p style="color:#c0392b;font-size:13px;margin-top:8px">Incorrect password.</p>');
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    }
    return;
  }

  if (method === "GET" && path === "/auth/logout") {
    res.writeHead(303, { "Set-Cookie": "md_session=; Max-Age=0; Path=/", Location: "/" });
    res.end();
    return;
  }

  // Allow healthcheck through without auth.
  if (method === "GET" && path === "/api/status") {
    sendJson(res, 200, {
      classifier: getProvider().name,
      autopoll: config.webAutopoll,
      pollIntervalMinutes: config.pollIntervalMinutes,
    });
    return;
  }

  if (!isAuthenticated(req)) {
    if (path.startsWith("/api/")) {
      sendJson(res, 401, { error: "Unauthorized" });
    } else {
      const html = readFileSync(LOGIN_HTML, "utf8").replace("<!--ERROR-->", "");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    }
    return;
  }

  // --- page ---------------------------------------------------------------
  if (method === "GET" && path === "/") {
    const html = readFileSync(INDEX_HTML, "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  // --- status -------------------------------------------------------------
  if (method === "GET" && path === "/api/status") {
    sendJson(res, 200, {
      classifier: getProvider().name,
      autopoll: config.webAutopoll,
      pollIntervalMinutes: config.pollIntervalMinutes,
    });
    return;
  }

  // --- documents ----------------------------------------------------------
  if (method === "GET" && path === "/api/documents") {
    sendJson(res, 200, { documents: listDocuments(true) });
    return;
  }

  if (method === "POST" && path === "/api/documents") {
    const body = await readJson(req);
    const docUrl = String(body.url ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!docUrl || !name) {
      sendJson(res, 400, { error: "url and name are required" });
      return;
    }
    const tier: Tier = body.tier === "commercial" ? "commercial" : "free";
    const vendor = body.vendor ? String(body.vendor).trim() : null;
    const rawInterval = Number(body.check_interval_minutes);
    const check_interval_minutes = rawInterval > 0 ? rawInterval : null;
    try {
      const document = addDocument({ url: docUrl, name, vendor, tier, check_interval_minutes });
      sendJson(res, 201, { document });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("UNIQUE constraint failed")) {
        sendJson(res, 409, { error: "This URL is already in the watchlist." });
      } else {
        throw err;
      }
    }
    return;
  }

  const patchMatch = path.match(/^\/api\/documents\/(\d+)$/);
  if (method === "PATCH" && patchMatch) {
    const id = Number(patchMatch[1]);
    const body = await readJson(req);
    const patch: Record<string, unknown> = {};
    if ("check_interval_minutes" in body) {
      const v = Number(body.check_interval_minutes);
      patch.check_interval_minutes = v > 0 ? v : null;
    }
    if ("name" in body) patch.name = String(body.name).trim();
    if ("vendor" in body) patch.vendor = body.vendor ? String(body.vendor).trim() : null;
    if ("tier" in body) patch.tier = body.tier === "commercial" ? "commercial" : "free";
    const updated = updateDocument(id, patch as Parameters<typeof updateDocument>[1]);
    if (!updated) { sendJson(res, 404, { error: "Not found" }); return; }
    sendJson(res, 200, { document: updated });
    return;
  }

  const checkMatch = path.match(/^\/api\/documents\/(\d+)\/check$/);
  if (method === "POST" && checkMatch) {
    const id = Number(checkMatch[1]);
    const outcome = await checkDocument(id);
    sendJson(res, 200, { outcome: serializeOutcome(outcome) });
    return;
  }

  const historyMatch = path.match(/^\/api\/documents\/(\d+)\/history$/);
  if (method === "GET" && historyMatch) {
    const id = Number(historyMatch[1]);
    const changes = listChanges(id).map((c) => ({
      ...c,
      findings: findingsForChange(c.id),
    }));
    sendJson(res, 200, { changes });
    return;
  }

  // --- bulk + demo --------------------------------------------------------
  if (method === "POST" && path === "/api/check-all") {
    const outcomes = (await checkAll()).map(serializeOutcome);
    sendJson(res, 200, { outcomes });
    return;
  }

  if (method === "POST" && path === "/api/demo") {
    const result = await runDemo();
    sendJson(res, 200, result);
    return;
  }

  if (method === "POST" && path === "/api/capture") {
    const body = await readJson(req);
    const url = String(body.url ?? "").trim();
    const html = String(body.html ?? "");
    const name = String(body.name ?? "Captured terms").trim();
    const vendor = body.vendor ? String(body.vendor).trim() : null;
    const tier: Tier = body.tier === "commercial" ? "commercial" : "free";
    if (!url || !html) { sendJson(res, 400, { error: "url and html are required" }); return; }
    const { createHash } = await import("node:crypto");
    const contentText = htmlToText(html);
    const contentHash = createHash("sha256").update(contentText).digest("hex");
    const doc = getDocumentByUrl(url) ?? addDocument({ url, name, vendor, tier });
    const snapshot = insertSnapshot({ documentId: doc.id, contentText, contentHash, httpStatus: 200 });
    sendJson(res, 201, { document: doc, snapshot_id: snapshot.id });
    return;
  }

  if (method === "POST" && path === "/api/compare") {
    const body = await readJson(req);
    const urlA = String(body.urlA ?? "").trim();
    const urlB = String(body.urlB ?? "").trim();
    const name = String(body.name ?? "Comparison").trim();
    const vendor = body.vendor ? String(body.vendor).trim() : null;
    const tier: Tier = body.tier === "commercial" ? "commercial" : "free";
    if (!urlA || !urlB) {
      sendJson(res, 400, { error: "urlA and urlB are required" });
      return;
    }
    const [fetchedA, fetchedB] = await Promise.all([fetchTerms(urlA), fetchTerms(urlB)]);
    const diff = diffSnapshots(fetchedA.contentText, fetchedB.contentText);
    if (!diff.hasChanges) {
      sendJson(res, 200, { status: "unchanged", name });
      return;
    }
    // Persist: reuse existing document for urlB if already watched, else create it.
    const doc = getDocumentByUrl(urlB) ?? addDocument({ url: urlB, name, vendor, tier });
    const snapA = insertSnapshot({ documentId: doc.id, contentText: fetchedA.contentText, contentHash: fetchedA.contentHash, httpStatus: fetchedA.httpStatus });
    const snapB = insertSnapshot({ documentId: doc.id, contentText: fetchedB.contentText, contentHash: fetchedB.contentHash, httpStatus: fetchedB.httpStatus });
    const classification = await classifyChange(doc, diff.diffText);
    const change = recordChange(
      { documentId: doc.id, fromSnapshotId: snapA.id, toSnapshotId: snapB.id, summary: classification.summary, diffText: diff.diffText },
      classification.findings,
    );
    const findings = findingsForChange(change.id);
    notify({ document: doc, summary: classification.summary, findings }).catch(() => {});
    sendJson(res, 200, {
      status: "changed",
      document: doc,
      change_id: change.id,
      name: doc.name,
      summary: classification.summary,
      diff: diff.diffText,
      findings,
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error("[web] request error:", err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    } else {
      res.end();
    }
  });
});

server.listen(config.port, config.host, () => {
  console.log(`MarkoDoc dashboard → http://localhost:${config.port}`);
  console.log(`Classifier: ${getProvider().name}`);
  if (config.webAutopoll) {
    console.log(`Auto-poll on: every ${config.pollIntervalMinutes} min`);
    startScheduler(config.pollIntervalMinutes);
  } else {
    console.log("Auto-poll off (set WEB_AUTOPOLL=true to enable).");
  }
});
