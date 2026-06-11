#!/usr/bin/env node
// One-off: insert canonical frontmatter into every docs page.
// canonical = https://rendobar.com/docs/<path-without-.mdx>
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BASE = 'https://rendobar.com/docs/';

function walkMdx(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (['snippets', '.claude', 'node_modules', 'superpowers', '.git'].includes(entry)) continue;
      walkMdx(full, files);
    } else if (entry.endsWith('.mdx')) {
      files.push(full);
    }
  }
  return files;
}

let changed = 0;
for (const file of walkMdx(ROOT)) {
  const content = readFileSync(file, 'utf8');
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(eol);
  if (lines[0] !== '---') { console.error(`SKIP no frontmatter: ${file}`); continue; }
  const close = lines.indexOf('---', 1);
  if (close === -1) { console.error(`SKIP unterminated frontmatter: ${file}`); continue; }
  const slug = relative(ROOT, file).replace(/\\/g, '/').replace(/\.mdx$/, '');
  const canonical = `canonical: "${BASE}${slug}"`;
  const existing = lines.findIndex((l, i) => i > 0 && i < close && l.startsWith('canonical:'));
  if (existing !== -1) {
    if (lines[existing] === canonical) continue;
    lines[existing] = canonical;
  } else {
    lines.splice(close, 0, canonical);
  }
  writeFileSync(file, lines.join(eol));
  changed++;
  console.log(`${slug} -> ${BASE}${slug}`);
}
console.log(`Done. ${changed} files updated.`);
