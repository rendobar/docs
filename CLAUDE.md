# Rendobar Docs

> Mintlify docs site. Sole content surface for `rendobar.com/docs/*` (proxied
> from `rendobar.com` Astro site to this Mintlify deployment).

---

## CROSS-REPO BRAND CONSISTENCY

This repo is part of the broader Rendobar platform. The canonical reference
for brand strings, URLs, metadata conventions, and entity rules lives in the
apex monorepo at `rendobar/rendobar` `.claude/rules/brand-consistency.md`.

You can read it here:
https://github.com/rendobar/rendobar/blob/main/.claude/rules/brand-consistency.md

The critical rules are also embedded below so you don't need to context-switch.
**If anything in this file conflicts with the apex rule file, the apex rule
file wins** — open a PR there to update it, then mirror the change here.

---

## Canonical brand strings (these MUST match apex)

| Field | Value |
|---|---|
| Display name | `Rendobar` |
| Slogan | `Serverless media processing API` |
| Apex URL | `https://rendobar.com` |
| Apex page URLs | `https://rendobar.com/<path>/` (always trailing slash) |
| API URL | `https://api.rendobar.com` |
| Dashboard URL | `https://app.rendobar.com` |
| CDN URL | `https://cdn.rendobar.com` |
| Twitter handle | `@rendobar` |
| Locale | `en_US` |
| OG image (universal) | `https://rendobar.com/brand/og-default.jpg` (1200×630 JPG) |
| Theme color (light) | `#FFFFFF` |
| Theme color (dark) | `#0A0A0A` |

**Forbidden variants**: `Rendobar.com`, `the Rendobar platform`, `rendobar`
(lowercase except in URLs), `https://www.rendobar.com`, `http://rendobar.com`,
apex page links without a trailing slash.

---

## Mintlify-specific rules

### Title rules (per-page MDX frontmatter)

Mintlify auto-appends ` - Rendobar` (hyphen) to every page's `<title>`. We
accept this cosmetic separator difference vs the apex em-dash because forking
Mintlify isn't worth it. Everything else stays consistent.

| Rule | Why |
|---|---|
| `title:` is sentence-case subject ONLY (12–48 chars) | Mintlify produces `<subject> - Rendobar` |
| **NEVER prefix `title` with `Rendobar`** | Produces double-brand `Rendobar CLI - Rendobar` |
| **NEVER include `&`, use `and`** | Sentence case + AI parsers prefer `and` |
| Use `sidebarTitle:` for short nav labels when SEO title is long | e.g. `title: "Frequently asked questions"` + `sidebarTitle: "FAQ"` |
| **NEVER use ALL CAPS, emojis, year-stuffing, or trailing punctuation** | (same as apex) |
| Acronyms (FFmpeg, API, MCP, GDPR, SRT, VTT, CI/CD) keep their case | Sentence case rule allows this |

### Description rules (per-page MDX frontmatter)

Identical to apex:
- 100–160 characters
- Sentence case
- No brand prefix (`Rendobar` is in `<title>`)
- No CTAs (`Learn more`, `Try free`)
- Declarative, front-loaded value prop

### Site-wide metadata (`docs.json`)

Lives in `seo.metatags`. Required keys (must match apex):
```json
{
  "og:type": "website",
  "og:site_name": "Rendobar",
  "og:locale": "en_US",
  "og:image": "https://rendobar.com/brand/og-default.jpg",
  "og:image:width": "1200",
  "og:image:height": "630",
  "og:image:alt": "Rendobar — Serverless media processing API",
  "og:image:type": "image/jpeg",
  "twitter:card": "summary_large_image",
  "twitter:site": "@rendobar",
  "robots": "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
}
```

### Apex links in `docs.json` (nav, footer, anchors)

Apex Astro is configured with `trailingSlash: "always"`. Every link to an
`https://rendobar.com/<path>` URL **must end with `/`**. Validator on apex
rejects anything else. Examples:
- ✅ `https://rendobar.com/blog/`, `https://rendobar.com/pricing/`, `https://rendobar.com/terms/`
- ❌ `https://rendobar.com/blog`, `https://rendobar.com/pricing`

(The apex root `https://rendobar.com` itself has no trailing slash — that's
the only exception. Subdomains like `app.rendobar.com` and `api.rendobar.com`
are separate origins and don't follow this rule.)

### Sentence case for footer labels

Match apex page titles:
- ✅ "Terms of service", "Privacy policy", "Pricing", "Dashboard"
- ❌ "Terms of Service", "Privacy Policy"

---

## Audit script

Quick frontmatter sanity check from this repo's root:

```bash
for f in $(find . -name "*.mdx" -not -path "./node_modules/*" -not -path "./snippets/*"); do
  title=$(awk '/^title:/{sub(/^title: */, ""); gsub(/"/, ""); print; exit}' "$f")
  desc=$(awk '/^description:/{sub(/^description: */, ""); gsub(/"/, ""); print; exit}' "$f")
  tlen=${#title}; dlen=${#desc}
  flag=""
  [ "$dlen" -lt 100 ] || [ "$dlen" -gt 160 ] && flag="${flag}DESC!"
  [[ "$title" == *"Rendobar"* ]] && [[ "$f" != *"changelog"* ]] && flag="${flag}DBL-BRAND!"
  [ "$tlen" -lt 8 ] && flag="${flag}THIN!"
  printf "%-45s T=%-3d D=%-3d %s %s\n" "$f" "$tlen" "$dlen" "$flag" "$title"
done
```

A clean run shows no flags. Run before committing changes that touch frontmatter.

---

## Anti-patterns — never do these

- Use a brand-string variant other than canonical `Rendobar`
- Prefix `title:` frontmatter with `Rendobar` (Mintlify will double-brand)
- Use `&` in titles or descriptions (use `and`)
- Skip the trailing slash on a `https://rendobar.com/<path>` link
- Set `og:image` site-wide to anything other than `https://rendobar.com/brand/og-default.jpg`
- Block GPTBot, ClaudeBot, PerplexityBot anywhere
- Set `noindex` on a docs page (the entire site is intentionally indexable)
- Hand-edit `_redirects` or routing without coordinating with apex `apps/web/public/_redirects`
- Add a `Co-Authored-By: Claude` or "Generated with [Claude Code]" line in commit messages or PR descriptions
