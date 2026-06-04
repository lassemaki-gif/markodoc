import { createHash } from "node:crypto";
import { config } from "../config.js";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export interface FetchResult {
  contentText: string;
  contentHash: string;
  httpStatus: number;
}

/**
 * Fetch a URL and reduce it to readable text suitable for diffing.
 *
 * This is a deliberately simple extractor: it strips scripts, styles and tags,
 * collapses whitespace, and normalises line breaks. For production you would
 * swap this for a real readability pass (e.g. @mozilla/readability + linkedom)
 * so that boilerplate navigation does not create noisy diffs.
 */
export async function fetchTerms(url: string): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": "MarkoDoc/0.1 (+terms-monitor)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }

  const raw = await res.text();
  const contentText = extractText(raw, url);
  const contentHash = createHash("sha256").update(contentText).digest("hex");

  return { contentText, contentHash, httpStatus: res.status };
}

function extractText(html: string, url: string): string {
  try {
    const { document } = parseHTML(html);
    // Readability needs a proper base URL on the document
    (document as any).baseURI = url;
    const article = new Readability(document as any).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      return article.textContent
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join("\n")
        .trim();
    }
  } catch {
    // fall through to regex extractor
  }
  return htmlToText(html);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}
