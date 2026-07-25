#!/usr/bin/env node
/**
 * Webhooks guide consistency guard.
 *
 * Asserts the facts in guides/webhooks.mdx still match the canonical webhook
 * contract defined in the monorepo. Source of truth:
 *   - packages/shared/src/constants/webhook-events.ts  (event catalog, retry
 *     backoff, MAX_ENDPOINTS_PER_ORG)
 *   - packages/shared/src/types/webhook.ts             (envelope fields)
 *   - apps/api/src/routes/webhook-endpoints.ts         (whd_ delivery id,
 *     header names) + lib/webhooks.ts (signed string {timestamp}.{body})
 *   - packages/sdk/src/lib/webhook-verify.ts           (verifyWebhook helper)
 *
 * The docs repo does not vendor the monorepo, so the contract is embedded below.
 * When the contract changes in the monorepo, update EXPECTED here and the guide
 * in the same change. Exit 0 = consistent, exit 1 = drift.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FILE = "guides/webhooks.mdx";

// ── Canonical contract (mirror of the monorepo; see header) ──────────────────
const EVENTS = [
  "job.created", "job.started", "job.completed",
  "job.failed", "job.cancelled", "balance.low", "balance.depleted",
];
const HEADERS = [
  "X-Rendobar-Signature", "X-Rendobar-Timestamp",
  "X-Rendobar-Event", "X-Rendobar-Delivery", "X-Rendobar-Attempt",
];
const ENVELOPE_FIELDS = ["version", "event", "deliveryId", "timestamp", "orgId", "data"];
const RETRY_DELAYS_SEC = [10, 20, 40, 80, 160];
const SDK_METHODS = ["rotateSecret", "retryDelivery"]; // methods the guide shows in code
const MAX_ENDPOINTS = 10;
const DELIVERY_ID_PREFIX = "whd_";
const STALE_DELIVERY_ID_PREFIX = "del_"; // the bug we fixed; it must never return
const SIGNED_STRING = "{timestamp}.{body}";
const SDK_WEBHOOKS_ENTRY = "@rendobar/sdk/webhooks";
const EM_DASH = "—";
const EN_DASH = "–";

const md = readFileSync(join(ROOT, FILE), "utf8");
// Prose only: strip fenced blocks and inline code so code samples are not
// flagged by the punctuation check.
const prose = md.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

// 1. Every catalog event is documented
for (const e of EVENTS) check(`event ${e} documented`, md.includes(`\`${e}\``));

// 2. No event outside the catalog is documented (catches renamed/removed events)
const mentioned = [...md.matchAll(/`((?:job|balance)\.[a-z.]+)`/g)].map((m) => m[1]);
const unknown = [...new Set(mentioned)].filter((e) => !EVENTS.includes(e));
check("no unknown events documented", unknown.length === 0, unknown.join(", "));

// 3. All delivery headers present
for (const h of HEADERS) check(`header ${h}`, md.includes(h));

// 4. Delivery id uses whd_, and the old del_ is gone
check(`delivery id prefix ${DELIVERY_ID_PREFIX}`, md.includes(DELIVERY_ID_PREFIX));
check(`stale ${STALE_DELIVERY_ID_PREFIX} id removed`, !md.includes(STALE_DELIVERY_ID_PREFIX));

// 5. Envelope fields documented
for (const f of ENVELOPE_FIELDS) check(`envelope field ${f}`, md.includes(`\`${f}\``));

// 6. Retry backoff numbers present
for (const d of RETRY_DELAYS_SEC) check(`retry delay ${d}s`, new RegExp(`\\b${d} s\\b`).test(md));

// 7. Verification leads with the SDK one-liner
check(`imports ${SDK_WEBHOOKS_ENTRY}`, md.includes(SDK_WEBHOOKS_ENTRY));
check("uses verifyWebhook()", md.includes("verifyWebhook("));
check("documents signed string", md.includes(SIGNED_STRING));

// 8. SDK management methods referenced + the dashboard test action
for (const m of SDK_METHODS) check(`sdk client.webhooks.${m}()`, md.includes(`${m}(`));
check("mentions the Send Test action", /send test/i.test(md));

// 9. Limits + dashboard link
check(`max ${MAX_ENDPOINTS} endpoints noted`, new RegExp(`up to ${MAX_ENDPOINTS}\\b`).test(md));
check("links to the webhooks dashboard", md.includes("app.rendobar.com/webhooks"));

// 10. Prose punctuation (writing-style rule)
check("no em-dash in prose", !prose.includes(EM_DASH));
check("no en-dash in prose", !prose.includes(EN_DASH));

// ── Report ───────────────────────────────────────────────────────────────
const failed = checks.filter((c) => !c.ok);
for (const c of checks) {
  console.log(`${c.ok ? "✓" : "✗"} ${c.name}${!c.ok && c.detail ? ` (${c.detail})` : ""}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  console.error(`✗ webhooks guide drifted from the contract. Fix ${FILE}, or update EXPECTED in this script if the contract itself changed.`);
  process.exitCode = 1;
} else {
  console.log("✓ webhooks guide matches the webhook contract.");
}
