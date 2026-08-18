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
  ["max batch size", "maxBatchSize", fmtInt],
  ["job timeout", "maxJobTimeout", fmtDuration],
  ["output retention", "outputRetentionDays", fmtDays],
  ["total r2 storage", "storageQuota", fmtBytes],
];

const FILES = ["concepts/credits.mdx", "support/limits.mdx"];

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
  for (const file of FILES) {
    const md = readFileSync(join(ROOT, file), "utf8");
    for (const [label, key, fmt] of ROWS) {
      const row = tierRow(md, label);
      if (!row) continue; // not every row is in every file
      const wantFree = fmt(source.plans.free.limits[key]);
      const wantPro = fmt(source.plans.pro.limits[key]);
      if (row.free !== wantFree || row.pro !== wantPro) {
        errors.push(
          `${file}: "${label}" is | ${row.free} | ${row.pro} | but source says | ${wantFree} | ${wantPro} |`,
        );
      }
    }
  }

  if (errors.length) {
    console.error("✗ Plan-limit tables drifted from the source of truth:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    console.error(`\nUpdate the tables to match ${SOURCE_URL} (edit price-tiers.ts in the monorepo to change a value).`);
    process.exitCode = 1;
    return;
  }
  console.log("✓ Plan-limit tables match the source of truth.");
}

main();
