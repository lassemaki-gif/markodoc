# MarkoDoc

Capture the SaaS terms you accept, watch them for changes, and classify those
changes against GDPR, the EU AI Act, cross-border data-transfer concerns, and
your own custom rules.

The problem: companies accept dozens of SaaS terms on the fly and keep no record
of *what* they agreed to. Vendor terms — especially for AI products from small,
fast-moving providers — change quietly. Data that initially stayed in the EU can
start flowing to the US after a terms update nobody noticed. MarkoDoc keeps the
record and watches for exactly those shifts.

## How it works

```
Monitored URL → fetch & snapshot → diff vs last snapshot → LLM classify → report
                      ↑ scheduler polls on interval
```

When a snapshot's content hash changes, MarkoDoc computes a line-level diff and
sends only the changed lines to a small language model. Two tiers:

- **Free** — detects changes and produces a plain-language summary of what changed.
- **Commercial** — additionally maps each change to framework rules (GDPR / EU AI
  Act / data-transfer) plus your custom rules, with a severity and confidence per
  finding.

## Stack

TypeScript + Node, SQLite (via `better-sqlite3`) for zero-setup storage, and a
pluggable LLM provider. Gemini is wired up; if no `GEMINI_API_KEY` is set, an
offline keyword-based classifier runs so the full pipeline works without a key.
The web dashboard is a single self-contained page served by Node's built-in
`http` module — no frontend build step, no extra runtime dependencies.

## Setup

Requires Node 20+.

```bash
npm install
cp .env.example .env   # optionally add GEMINI_API_KEY; everything else has defaults
```

## Try it locally (web dashboard)

```bash
npm run serve
# → MarkoDoc dashboard at http://localhost:4000
```

From the dashboard you can add a terms URL, run checks, and read the findings.
The **Load offline demo** button runs the full diff → classify pipeline against
two bundled sample versions of a vendor's terms (EU-only → US data residency,
plus model-training and a new sub-processor) — so you can see how a change is
flagged with **zero network access**, even when the offline heuristic classifier
is in use.

> Live monitoring of real URLs requires network access to fetch the page; the
> offline demo does not.

## Continuous monitoring (scheduler)

```bash
npm run schedule           # polls every POLL_INTERVAL_MINUTES (default 60)
POLL_INTERVAL_MINUTES=15 npm run schedule
```

The scheduler runs one cycle immediately, then on the interval. Cycles never
overlap, and an error in one document doesn't stop the run. You can also set
`WEB_AUTOPOLL=true` to have `npm run serve` poll in-process.

## Usage (CLI)

```bash
# Start monitoring a terms page
npm run dev -- add -u "https://example.com/terms" -n "Example AI" -v "Example Inc" -t commercial

# List what you're monitoring
npm run dev -- list

# Capture a baseline / detect a change for one document…
npm run dev -- check -i 1
# …or all of them
npm run dev -- check --all      # (also: npm run poll)

# Review the change history and findings
npm run dev -- history -i 1
```

The first `check` captures a baseline. Each subsequent `check` compares against
the previous snapshot and only records a change if the text actually differs.

## Project layout

```
src/
  config.ts            environment-driven config
  types.ts             shared domain types
  scheduler.ts         interval runner around checkAll() (+ runnable directly)
  db/
    schema.sql         tables: documents, snapshots, changes, findings, custom_rules
    index.ts           connection + typed query helpers
  capture/fetcher.ts   fetch URL → readable text → sha256 hash
  diff/differ.ts       line-level diff of changed regions only
  classify/
    rules.ts           framework rule catalogue (GDPR / EU AI Act / data transfer)
    provider.ts        LlmProvider interface
    gemini.ts          Gemini-backed classifier (JSON output)
    mock.ts            offline heuristic classifier (no key needed)
    classifier.ts      provider selection + tier logic
  monitor/monitor.ts   orchestration: fetch → diff → classify → persist
  cli.ts               commands: add, list, check, history
  web/
    server.ts          http JSON API + serves the dashboard
    index.html         single-page dashboard (no build step)
    demo.ts            offline sample run for the dashboard
```

## HTTP API

`npm run serve` exposes:

| Method | Path                              | Purpose                          |
|--------|-----------------------------------|----------------------------------|
| GET    | `/api/status`                     | classifier mode + poll settings  |
| GET    | `/api/documents`                  | list monitored documents         |
| POST   | `/api/documents`                  | add `{ url, name, vendor, tier }`|
| POST   | `/api/documents/:id/check`        | fetch + analyse one document     |
| GET    | `/api/documents/:id/history`      | changes + findings               |
| POST   | `/api/check-all`                  | check every active document      |
| POST   | `/api/demo`                       | run the offline sample           |

The server binds to `127.0.0.1` only.

## Roadmap (next steps)

1. ~~**Scheduler**~~ — done (`src/scheduler.ts`). Next: cron expressions / per-document intervals.
2. ~~**HTTP API + dashboard**~~ — done (`src/web/`). Next: persist & display diffs, filter by severity, per-document detail pages.
3. **Better extraction** — replace the regex text extractor with a real
   readability pass so navigation/boilerplate doesn't create noisy diffs.
4. **Notifications** — email/Slack/webhook on `changed` outcomes above a severity.
5. **Capture-at-acceptance** — a browser extension to record the *exact* clickwrap
   terms a user accepted (these can differ from the public terms page).
6. **Postgres** — swap the SQLite layer for Postgres for multi-tenant deployment.

## Important: not legal advice

MarkoDoc's classifications are advisory signals to help a human prioritise review.
They are produced by heuristics and a language model, can be wrong, and are not a
legal determination of GDPR or EU AI Act compliance. Always have qualified counsel
review material changes.

Respect each site's robots.txt and terms when polling, and use reasonable
intervals.
