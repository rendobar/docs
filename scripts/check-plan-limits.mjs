#!/usr/bin/env node
/**
 * Plan-limit consistency guard for the docs.
 *
 * The single source of truth for plan tiers is the monorepo's
 * packages/shared/src/constants/price-tiers.ts, published (generated) at
 * https://rendobar.com/plan-limits.json. This script fetches that export and
 * asserts the tier tables in concepts/credits.mdx and support/limits.mdx match
 * it, so the docs can never silently drift from the real limits.
 *
 * If the published JSON is unreachable (e.g. it has not deployed yet), the
 * check warns and exits 0 rather than blocking. Once live it enforces.
 *
 * Exit 0 = consistent (or source unreachable). Exit 1 = a table cell is stale.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_URL = "https://rendobar.com/plan-limits.json";

const fmtInt = (n) => String(n);
const fmtBytes = (n) =>
  n % 1024 ** 3 === 0 ? `${n / 1024 ** 3} GB` : `${n / 1024 ** 2} MB`;
// Mirrors formatTimeout() in the monorepo's packages/shared/src/constants/
// pricing-display.ts. This repo cannot import it, so the two are kept honest by
// this script itself: it renders from the LIVE plan-limits.json and fails when a
// table cell disagrees, which is exactly what a drift in either would produce.
const fmtDuration = (sec) => {
  if (sec >= 3600) {
    const h = sec / 3600;
    const r = Number.isInteger(h) ? h : Math.round(h * 10) / 10;
    return `${r} ${r === 1 ? "hour" : "hours"}`;
  }
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec}s`;
};
const fmtDays = (n) => `${n} days`;

// label substring (lowercased) -> [limits key, formatter]
const ROWS = [
  ["concurrent jobs", "concurrentJobs", fmtInt],
  ["queued backlog", "maxQueuedJobs", fmtInt],
  ["api requests", "apiRequestsPerMinute", fmtInt],
  ["max input file", "maxInputFileSize", fmtBytes],
  ["job timeout", "maxJobTimeout", fmtDuration],
  ["output retention", "outputRetentionDays", fmtDays],
  // The table heading is "Total object storage"; the old "total r2 storage"
  // label matched nothing, so this row went unchecked.
  ["total object storage", "storageQuota", fmtBytes],
];

const FILES = ["concepts/credits.mdx", "support/limits.mdx"];

/**
 * Frontmatter descriptions repeat these numbers, and nothing checked them.
 * support/limits.mdx advertised "30 vs 300/min" and "100 MB vs 2 GB" while its
 * table, which IS checked, said 120/600 and 500 MB/10 GB. The description is
 * what a search result and an AI answer quote, so it was the most-read wrong
 * number on the site.
 *
 * Each pattern must match. Rephrase the sentence and this fails, telling you to
 * update the pattern, rather than quietly checking nothing.
 */
const DESCRIPTION_CLAIMS = [
  {
    file: "support/limits.mdx",
    what: "rate limits",
    pattern: /rate limits \((\S+) vs (\S+)\/min\)/,
    key: "apiRequestsPerMinute",
    fmt: fmtInt,
  },
  {
    file: "support/limits.mdx",
    what: "file size caps",
    pattern: /file size caps \(([\d.]+ [MG]B) vs ([\d.]+ [MG]B)\)/,
    key: "maxInputFileSize",
    fmt: fmtBytes,
  },
];

const description = (md) => /^description:\s*"([^"]*)"/m.exec(md)?.[1] ?? "";

/** Find the `| label… | free | pro |` row and return the free/pro cells. */
function tierRow(md, labelSubstring) {
  const line = md
    .split("\n")
    .find((l) => l.includes("|") && l.toLowerCase().includes(labelSubstring));
  if (!line) return null;
  const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
  return { free: cells[1], pro: cells[2] };
}

async function main() {
  let source;
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    source = await res.json();
  } catch (err) {
    console.warn(`⚠ plan-limits source unreachable (${SOURCE_URL}): ${err.message}. Skipping.`);
    return; // exit 0 — let Node drain the socket pool cleanly
  }

  const errors = [];
  // A label that matches nothing used to `continue` silently, so renaming a row
  // heading disabled its check without a word. Track what matched instead.
  const matchedLabels = new Set();
  for (const file of FILES) {
    const md = readFileSync(join(ROOT, file), "utf8");
    for (const [label, key, fmt] of ROWS) {
      const row = tierRow(md, label);
      if (!row) continue; // not every row is in every file
      matchedLabels.add(label);
      const wantFree = fmt(source.plans.free.limits[key]);
      const wantPro = fmt(source.plans.pro.limits[key]);
      if (row.free !== wantFree || row.pro !== wantPro) {
        errors.push(
          `${file}: "${label}" is | ${row.free} | ${row.pro} | but source says | ${wantFree} | ${wantPro} |`,
        );
      }
    }
  }

  for (const label of ROWS.map(([l]) => l)) {
    if (!matchedLabels.has(label)) {
      errors.push(`no table row matched "${label}" in any checked file — was the row renamed or removed?`);
    }
  }

  for (const claim of DESCRIPTION_CLAIMS) {
    const desc = description(readFileSync(join(ROOT, claim.file), "utf8"));
    const m = claim.pattern.exec(desc);
    if (!m) {
      errors.push(
        `${claim.file}: the description no longer states "${claim.what}" in the expected shape, so it is unchecked. Update DESCRIPTION_CLAIMS.`,
      );
      continue;
    }
    const wantFree = claim.fmt(source.plans.free.limits[claim.key]);
    const wantPro = claim.fmt(source.plans.pro.limits[claim.key]);
    if (m[1] !== wantFree || m[2] !== wantPro) {
      errors.push(
        `${claim.file}: description says ${claim.what} are ${m[1]} vs ${m[2]} but source says ${wantFree} vs ${wantPro}`,
      );
    }
  }

  if (errors.length) {
    console.error("✗ Plan-limit tables drifted from the source of truth:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    console.error(`\nUpdate the tables to match ${SOURCE_URL} (edit price-tiers.ts in the monorepo to change a value).`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ Plan-limit tables and descriptions match the source of truth.");
}

main();
