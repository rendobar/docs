#!/usr/bin/env node
/**
 * Frontmatter SEO validator for Rendobar docs (Mintlify).
 *
 * Rules:
 * - title: 13-52 chars, sentence case, no em/en-dash, no pipe, no --, no "Rendobar"
 * - description: 100-160 chars, starts with allowed action verb, no em-dash, no "Rendobar" prefix
 * - description must be present on every page (except snippets)
 * - canonical: must equal https://rendobar.com/docs/<page-path>. Mintlify's
 *   auto-canonical drops the /docs subpath on the rendobar.mintlify.app
 *   subdomain (points at a 404), so every page pins its canonical explicitly.
 *
 * Exit 0 = all pass. Exit 1 = at least one violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Allowed description start verbs (case-insensitive check on first word)
const ALLOWED_VERBS = new Set([
  'run', 'build', 'add', 'convert', 'embed', 'generate', 'process', 'render',
  'transcode', 'watermark', 'caption', 'redact', 'extract', 'probe', 'submit',
  'deploy', 'send', 'receive', 'read', 'explore', 'find', 'see', 'browse',
  'compare', 'get', 'start', 'discover', 'learn', 'review', 'view',
  'burn', 'install', 'authenticate', 'sign', 'fix', 'configure', 'connect',
  'use', 'every', 'execute', 'two', 'schemas', 'three', 'quick', 'known',
  'receive', 'set', 'tune',
]);

// Characters banned in title
const BANNED_TITLE_CHARS = /[—–|]/;
const DOUBLE_DASH = /--/;

// Single-word blocklist for titles
const TITLE_BLOCKLIST = new Set([
  'about', 'pricing', 'features', 'blog', 'docs', 'home', 'contact',
  'changelog', 'privacy', 'terms',
]);

function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return null;
  const fmRaw = content.slice(4, end);
  const result = {};
  for (const line of fmRaw.split('\n')) {
    const m = line.match(/^(\w[\w-]*):\s*"?(.+?)"?\s*$/);
    if (m) result[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return result;
}

function walkMdx(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // Skip snippets (Mintlify partials, not standalone pages)
      // Skip .claude worktree dirs
      if (entry === 'snippets' || entry === '.claude' || entry === 'node_modules') continue;
      walkMdx(full, files);
    } else if (entry.endsWith('.mdx')) {
      files.push(full);
    }
  }
  return files;
}

function validate(filePath, fm, violations) {
  const rel = relative(ROOT, filePath);

  if (!fm) {
    violations.push({ file: rel, line: 1, message: 'No frontmatter block found' });
    return;
  }

  const { title, description } = fm;

  // --- Title checks ---
  if (!title) {
    violations.push({ file: rel, field: 'title', message: 'Missing title field' });
  } else {
    const len = title.length;
    if (len < 13 || len > 52) {
      violations.push({
        file: rel, field: 'title',
        message: `Title length ${len} out of range [13-52]: "${title}"`,
      });
    }
    if (BANNED_TITLE_CHARS.test(title)) {
      violations.push({
        file: rel, field: 'title',
        message: `Title contains banned character (em-dash, en-dash, or pipe): "${title}"`,
      });
    }
    if (DOUBLE_DASH.test(title)) {
      violations.push({
        file: rel, field: 'title',
        message: `Title contains double dash: "${title}"`,
      });
    }
    if (/\brendobar\b/i.test(title)) {
      violations.push({
        file: rel, field: 'title',
        message: `Title must not contain "Rendobar" (Mintlify appends brand suffix): "${title}"`,
      });
    }
    // Single-word blocklist check
    const words = title.trim().toLowerCase().split(/\s+/);
    if (words.length === 1 && TITLE_BLOCKLIST.has(words[0])) {
      violations.push({
        file: rel, field: 'title',
        message: `Title is a single blocked word: "${title}"`,
      });
    }
  }

  // --- Description checks ---
  if (!description) {
    violations.push({ file: rel, field: 'description', message: 'Missing description field' });
  } else {
    const len = description.length;
    if (len < 100 || len > 160) {
      violations.push({
        file: rel, field: 'description',
        message: `Description length ${len} out of range [100-160]: "${description}"`,
      });
    }
    if (/^rendobar\b/i.test(description.trim())) {
      violations.push({
        file: rel, field: 'description',
        message: `Description must not start with "Rendobar": "${description.slice(0, 50)}..."`,
      });
    }
    if (/—/.test(description)) {
      violations.push({
        file: rel, field: 'description',
        message: `Description contains em-dash: "${description.slice(0, 60)}..."`,
      });
    }
    // Check first word against allowed verbs
    const firstWord = description.trim().split(/[\s,.:;]/)[0].toLowerCase();
    if (!ALLOWED_VERBS.has(firstWord)) {
      violations.push({
        file: rel, field: 'description',
        message: `Description starts with unallowed word "${firstWord}": "${description.slice(0, 60)}..."`,
      });
    }
  }

  // --- Canonical checks ---
  const expectedCanonical =
    'https://rendobar.com/docs/' + rel.replace(/\\/g, '/').replace(/\.mdx$/, '');
  if (!fm.canonical) {
    violations.push({
      file: rel, field: 'canonical',
      message: `Missing canonical field (expected "${expectedCanonical}")`,
    });
  } else if (fm.canonical !== expectedCanonical) {
    violations.push({
      file: rel, field: 'canonical',
      message: `Canonical "${fm.canonical}" does not match expected "${expectedCanonical}"`,
    });
  }
}

function main() {
  const files = walkMdx(ROOT);
  const violations = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);
    validate(file, fm, violations);
  }

  if (violations.length === 0) {
    console.log(`Checked ${files.length} MDX files. All frontmatter valid.`);
    process.exit(0);
  }

  console.error(`\nFrontmatter violations (${violations.length}):\n`);
  for (const v of violations) {
    const loc = v.line ? `${v.file}:${v.line}` : `${v.file} [${v.field}]`;
    console.error(`  ${loc}\n    ${v.message}\n`);
  }
  process.exit(1);
}

main();
