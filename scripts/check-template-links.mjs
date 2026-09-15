#!/usr/bin/env node
/**
 * Keeps the templates page honest about the workflows it links.
 *
 * Every H2 section on automation/templates.mdx that links a workflow JSON in
 * rendobar/n8n-nodes-rendobar must:
 *
 * 1. link a file that exists on that repo's main branch, and
 * 2. carry the exact title that repo's templates/README.md gives the file.
 *
 * Titles are rewritten for the n8n Creator Portal in the templates repo first,
 * so a heading copied here by hand drifts without either repo noticing. A
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
const LINK = /https:\/\/raw\.githubusercontent\.com\/rendobar\/n8n-nodes-rendobar\/main\/templates\/([\w.-]+\.json)/g;

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

const page = readFileSync(join(ROOT, 'automation', 'templates.mdx'), 'utf8');
const sections = page
  .split(/^## /m)
  .slice(1)
  .map((chunk) => {
    const newline = chunk.indexOf('\n');
    return { heading: chunk.slice(0, newline).trim(), body: chunk.slice(newline) };
  });

const violations = [];
let linked = 0;

for (const { heading, body } of sections) {
  for (const file of new Set([...body.matchAll(LINK)].map((m) => m[1]))) {
    linked++;
    const response = await fetch(`${RAW}${file}`, { method: 'HEAD' });
    if (!response.ok) {
      violations.push(`"${heading}" links templates/${file}, which returns HTTP ${response.status} on main.`);
    }
    const title = titles.get(file);
    if (title === undefined) {
      violations.push(`templates/${file} has no row in the templates README, so its title cannot be checked.`);
    } else if (title !== heading) {
      violations.push(`The section "${heading}" links templates/${file}, whose README title is "${title}".`);
    }
  }
}

// A page rewrite that changes the link format would otherwise pass with nothing checked.
if (linked === 0) {
  violations.push('automation/templates.mdx links no workflow JSON that this check recognises.');
}

if (violations.length === 0) {
  console.log(`Checked ${linked} template links against the n8n templates repo. All consistent.`);
  process.exit(0);
}

console.error(`\nTemplate link violations (${violations.length}):\n`);
for (const v of violations) console.error(`  ${v}\n`);
process.exit(1);
