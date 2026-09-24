#!/usr/bin/env node
/**
 * Structural validator for docs.json against the file tree.
 *
 * Two classes of bug this catches, both of which shipped to production before
 * this check existed:
 *
 * 1. Orphan pages. Mintlify serves EVERY .md/.mdx in the repo at its path,
 *    whether or not it appears in `navigation`. An internal engineering note
 *    (ANALYTICS.md) was therefore live at /docs/ANALYTICS and listed in the
 *    public sitemap. CLAUDE.md and README.md had already been deleted from this
 *    repo for the same reason. Note the sibling frontmatter validator only walks
 *    `.mdx`, so a stray `.md` passes every other check.
 *
 * 2. Redirects pointing at pages that do not exist. `/mcp/:slug*` pointed at
 *    `/mcp`, but the page is `mcp-server`. Every /docs/mcp/* URL therefore
 *    308'd into a dead end, including two links in the public llms.txt.
 *
 * Both are static checks against docs.json plus the file tree. No network.
 *
 * Exit 0 = all pass. Exit 1 = at least one violation.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Directories that never produce a published page.
// `snippets` holds Mintlify partials; the rest are tooling or assets.
const SKIP_DIRS = new Set(['snippets', 'node_modules', 'scripts', 'images', 'logo']);

/** Every .md/.mdx in the repo that Mintlify would serve as a page. */
function walkPages(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    // ponytail: dot-dirs (.git, .github, .claude) are not part of the content
    // tree. This is also the escape hatch for internal notes: put them there.
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walkPages(full, files);
    } else if (entry.endsWith('.mdx') || entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

/** Slug as Mintlify routes it: repo-relative path, POSIX separators, no extension. */
function toSlug(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/').replace(/\.mdx?$/, '');
}

/**
 * Recursively collect every page string in the nav.
 *
 * A page reaches the nav two ways: as an entry in a `pages` array, or as a
 * group's `root`, which Mintlify renders as the group's own landing page. Only
 * `pages` was collected here, so giving a group a `root` reported that page as
 * an orphan even though it is the most reachable page in the section.
 */
function collectNavSlugs(node, out = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) collectNavSlugs(item, out);
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'root' && typeof value === 'string') {
        out.add(value);
      } else if (key === 'pages' && Array.isArray(value)) {
        for (const page of value) {
          if (typeof page === 'string') out.add(page);
          else collectNavSlugs(page, out);
        }
      } else {
        collectNavSlugs(value, out);
      }
    }
  }
  return out;
}

function main() {
  const config = JSON.parse(readFileSync(join(ROOT, 'docs.json'), 'utf8'));
  const navSlugs = collectNavSlugs(config.navigation);
  const pageSlugs = new Set(walkPages(ROOT).map(toSlug));
  const violations = [];

  // --- 1. Orphan pages: on disk (therefore live) but absent from navigation ---
  for (const slug of [...pageSlugs].sort()) {
    if (!navSlugs.has(slug)) {
      violations.push(
        `Orphan page "${slug}" is not in docs.json navigation, but Mintlify still ` +
          `serves it at https://rendobar.com/docs/${slug} and lists it in the sitemap. ` +
          `Add it to the nav, or move it into a dot-directory (e.g. .github/) if it is internal.`
      );
    }
  }

  // --- 2. Redirect destinations that resolve to nothing ---
  for (const { source, destination } of config.redirects ?? []) {
    if (/^https?:\/\//.test(destination)) continue; // off-site, not ours to verify
    if (destination.includes(':')) continue; // dynamic (:slug*), not statically resolvable
    const slug = destination.replace(/^\//, '').replace(/#.*$/, '');
    // A folder URL such as /automation is served by its index page.
    if (!pageSlugs.has(slug) && !pageSlugs.has(`${slug}/index`)) {
      violations.push(
        `Redirect "${source}" points at "${destination}", which is not a page in this repo. ` +
          `Every URL matching that source is a dead end.`
      );
    }
  }

  // --- 3. A page file sitting beside a directory of the same name ---
  //
  // `jobs/compose.mdx` next to `jobs/compose/` shipped on 2026-09-24 and broke
  // EVERY page under that directory in production: all 24 children served the
  // parent's content. The sitemap and llms.txt listed them, so the build saw
  // them; only the routing collapsed. `mint dev` does not reproduce it, which
  // is why it reached the live site.
  //
  // The working shape is `<dir>/index.mdx`, which is what `storage/` and
  // `automation/` already use. `/docs/<dir>` still serves it, so no URL moves.
  for (const slug of [...pageSlugs].sort()) {
    const asDir = join(ROOT, slug);
    let isDir = false;
    try {
      isDir = statSync(asDir).isDirectory();
    } catch {
      // No directory of that name: nothing to collide with.
    }
    if (isDir) {
      violations.push(
        `"${slug}.mdx" sits beside the directory "${slug}/". On Mintlify's production build ` +
          `every page under that directory serves "${slug}" instead of its own content, and ` +
          `\`mint dev\` does not reproduce it. Move it to "${slug}/index.mdx" and list that ` +
          `as the group's first page (see storage/index and automation/index).`
      );
    }
  }

  // --- 4. Nav entries with no file behind them ---
  for (const slug of [...navSlugs].sort()) {
    if (!pageSlugs.has(slug)) {
      violations.push(`Navigation lists "${slug}", but no matching .md/.mdx file exists.`);
    }
  }

  if (violations.length === 0) {
    console.log(
      `Checked ${pageSlugs.size} pages, ${navSlugs.size} nav entries, ` +
        `${(config.redirects ?? []).length} redirects. All consistent.`
    );
    process.exit(0);
  }

  console.error(`\ndocs.json structural violations (${violations.length}):\n`);
  for (const v of violations) console.error(`  ${v}\n`);
  process.exit(1);
}

main();
