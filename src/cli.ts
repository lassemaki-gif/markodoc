#!/usr/bin/env node
import { Command } from "commander";
import { config } from "./config.js";
import {
  addDocument,
  findingsForChange,
  getDocument,
  listChanges,
  listDocuments,
} from "./db/index.js";
import { getProvider } from "./classify/classifier.js";
import { checkAll, checkDocument } from "./monitor/monitor.js";
import type { Tier } from "./types.js";

const program = new Command();
program
  .name("markodoc")
  .description("Monitor and classify changes to accepted SaaS terms of use.")
  .version("0.1.0");

program
  .command("add")
  .description("Start monitoring a terms-of-use URL")
  .requiredOption("-u, --url <url>", "URL of the terms page")
  .requiredOption("-n, --name <name>", "Human-friendly name")
  .option("-v, --vendor <vendor>", "Vendor / company name")
  .option("-t, --tier <tier>", "free | commercial", config.defaultTier)
  .action((opts) => {
    const tier = (opts.tier === "commercial" ? "commercial" : "free") as Tier;
    const doc = addDocument({
      url: opts.url,
      name: opts.name,
      vendor: opts.vendor ?? null,
      tier,
    });
    console.log(`Added [${doc.id}] ${doc.name} (${doc.tier}) — ${doc.url}`);
  });

program
  .command("list")
  .description("List monitored documents")
  .action(() => {
    const docs = listDocuments(true);
    if (docs.length === 0) return console.log("No documents yet. Use 'add'.");
    for (const d of docs) {
      console.log(
        `[${d.id}] ${d.name}  (${d.tier})  ${d.vendor ?? "-"}\n     ${d.url}`,
      );
    }
  });

program
  .command("check")
  .description("Fetch and analyse one document (or all with --all)")
  .option("-i, --id <id>", "Document id")
  .option("-a, --all", "Check every active document")
  .action(async (opts) => {
    console.log(`Using classifier: ${getProvider().name}\n`);
    const outcomes = opts.all
      ? await checkAll()
      : [await checkDocument(Number(opts.id))];

    for (const o of outcomes) {
      const tag = `[${o.document.id}] ${o.document.name}`;
      if (o.status === "first_snapshot") console.log(`${tag}: baseline captured`);
      else if (o.status === "unchanged") console.log(`${tag}: no change`);
      else if (o.status === "error") console.log(`${tag}: ERROR — ${o.error}`);
      else {
        console.log(`${tag}: CHANGED`);
        console.log(`   ${o.change.summary}`);
        const findings = findingsForChange(o.change.id);
        for (const f of findings) {
          console.log(
            `   • [${f.severity.toUpperCase()}] ${f.rule_code} — ${f.title} (conf ${f.confidence})`,
          );
        }
      }
    }
  });

program
  .command("history")
  .description("Show change history and findings for a document")
  .requiredOption("-i, --id <id>", "Document id")
  .action((opts) => {
    const doc = getDocument(Number(opts.id));
    if (!doc) return console.log("No such document.");
    const changes = listChanges(doc.id);
    if (changes.length === 0) return console.log("No recorded changes.");
    for (const c of changes) {
      console.log(`\n— ${c.detected_at} —`);
      console.log(c.summary);
      for (const f of findingsForChange(c.id)) {
        console.log(
          `  • [${f.severity.toUpperCase()}] ${f.framework} ${f.rule_code}: ${f.title}`,
        );
        if (f.excerpt) console.log(`      ${f.excerpt}`);
      }
    }
  });

program.parseAsync(process.argv);
