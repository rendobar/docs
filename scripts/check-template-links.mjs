#!/usr/bin/env node
/**
 * Keeps the template cards honest about the workflows they link.
 *
 * Every card on automation/index.mdx that links a workflow JSON in
 * rendobar/n8n-nodes-rendobar must:
 *
 * 1. link a file that exists on that repo's main branch, and
 * 2. carry the exact title that repo's templates/README.md gives the file.
 *
 * Titles are rewritten for the n8n Creator Portal in the templates repo first,
 * so a card title copied here by hand drifts without either repo noticing. A
 * template renamed or deleted there fails this check here.
 *
 * Needs network access to raw.githubusercontent.com.
 * Exit 0 = all pass. Exit 1 = at least one violation.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/rendobar/n8n-nodes-rendobar/main/templates/';
// A <Card> whose title comes before an href into the templates folder.
const CARD = /<Card\s[^>]*?title="([^"]+)"[^>]*?href="https:\/\/raw\.githubusercontent\.com\/rendobar\/n8n-nodes-rendobar\/main\/templates\/([\w.-]+\.json)"/g;

const readmeResponse = await fetch(`${RAW}README.md`);
if (!readmeResponse.ok) {
  console.error(`Could not fetch templates/README.md: HTTP ${readmeResponse.status}`);
  process.exit(1);
}
const readme = await readmeResponse.text();

// README table rows look like: | [Title](./file.json) | What it does | Operations |
const titles = new Map(
  [...readme.matchAll(/^\| \[([^\]]+)\]\(\.\/([\w.-]+\.json)\) \|/gm)].map((m) => [m[2], m[1]])
);

const page = readFileSync(join(ROOT, 'automation', 'index.mdx'), 'utf8');
const violations = [];
let linked = 0;

for (const [, title, file] of page.matchAll(CARD)) {
  linked++;
  const response = await fetch(`${RAW}${file}`, { method: 'HEAD' });
  if (!response.ok) {
    violations.push(`The card "${title}" links templates/${file}, which returns HTTP ${response.status} on main.`);
  }
  const expected = titles.get(file);
  if (expected === undefined) {
    violations.push(`templates/${file} has no row in the templates README, so its title cannot be checked.`);
  } else if (expected !== title) {
    violations.push(`The card "${title}" links templates/${file}, whose README title is "${expected}".`);
  }
}

// A page rewrite that changes the card format would otherwise pass with nothing checked.
if (linked === 0) {
  violations.push('automation/index.mdx has no template card this check recognises.');
}

if (violations.length === 0) {
  console.log(`Checked ${linked} template cards against the n8n templates repo. All consistent.`);
  process.exit(0);
}

console.error(`\nTemplate link violations (${violations.length}):\n`);
for (const v of violations) console.error(`  ${v}\n`);
process.exit(1);
