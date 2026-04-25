# CLI Docs Section — Design Spec

**Date:** 2026-04-25
**Owner:** docs
**Target:** `rendobar.com/docs/cli/*` (Mintlify)
**Source of truth:** `D:/rendobar/cli` (`github.com/rendobar/cli`, v1.0.0)

## Problem

The Rendobar CLI shipped v1.0.0 with five platform binaries, OAuth login, FFmpeg passthrough, self-update, and a `doctor` command. The docs site has zero CLI coverage. Developers and AI agents who land on `rendobar.com/docs` cannot find install steps, command reference, or CI usage. The CLI README is the only documentation, and it lives in a different repo.

## Goals

1. A developer landing from a Google search at 2am for "rendobar cli install" finishes install + first job in under 5 minutes.
2. An LLM crawler (ChatGPT, Claude, Perplexity, Mintlify Assistant) can answer "how do I run FFmpeg with the Rendobar CLI in CI?" by reading the published `.md` mirror or `/llms-full.txt`.
3. Each command's flags, exit codes, env vars, and config paths are documented with the same wording as the binary's `--help` output.
4. No claim in the docs is fabricated. Every flag, env var, file path, and exit code matches `D:/rendobar/cli/src/`.

## Non-goals

- Per-command sub-pages. Five commands fit on one reference page.
- Auto-generated reference from `--help-json`. Worth doing later, not in v1 — defer until command count grows past ~10 or sub-commands appear.
- An npm wrapper page. Not shipped yet (per project memory).
- Codegen / SDK overlap. CLI docs link to SDK docs, never duplicate them.

## Diátaxis assignments (one mode per page, no mixing)

| Page | Mode | One-word answer |
|---|---|---|
| `cli/overview.mdx` | Explanation | "What" |
| `cli/installation.mdx` | How-to | "Install" |
| `cli/authentication.mdx` | How-to | "Auth" |
| `cli/commands.mdx` | Reference | "Spec" |
| `cli/ci-cd.mdx` | How-to | "Automate" |
| `cli/troubleshooting.mdx` | How-to | "Fix" |

Six pages. Stripe / Supabase pattern. No microsite.

## Page contracts

### `cli/overview.mdx` — Explanation

**User question:** "What is the Rendobar CLI and when do I use it?"

Opens with thesis: "The Rendobar CLI runs FFmpeg in the cloud from your terminal." Two-sentence framing, then a `<CodeGroup>` with the 30-second install + first job. Sections:

- "What you get" — short prose, no symmetric bullets
- "When to use the CLI vs the SDK" — opinion required (explanation page rule)
- "Quick install" — links to `installation.mdx`, does not duplicate it
- "First render" — single working `rb ffmpeg` command end-to-end
- `## See also`

Killer-feature angle: `rb ffmpeg <real-ffmpeg-args>` is the one thing no other competitor's CLI does. Lead with that.

### `cli/installation.mdx` — How-to

**User question:** "How do I install the Rendobar CLI?"

First screenful is the install command, in `<Tabs>` for macOS/Linux vs Windows. Below: verify, pin version, update, uninstall, env vars, install path. No marketing prose at the top. The page reads like the install script's `--help`.

Source-of-truth env vars (extracted from `install.sh` / `install.ps1`):

- `RENDOBAR_INSTALL_DIR` — override binary dir (default `$HOME/.rendobar/bin` or `%USERPROFILE%\.rendobar\bin`)
- `RENDOBAR_VERSION` — pin a tag (e.g. `v1.0.0`)
- `RENDOBAR_GITHUB_TOKEN` — bypass the GitHub 60/hr unauth limit (falls back to `GITHUB_TOKEN`)
- `RENDOBAR_NO_MODIFY_PATH=1` — install but don't touch shell rc / user PATH
- (uninstall) `RENDOBAR_PURGE=1` — also remove `~/.rendobar` (auth tokens)
- (uninstall) `RENDOBAR_CONFIG_DIR` — override config dir

Includes the "inspect before piping to shell" callout (security `<Note>`).

### `cli/authentication.mdx` — How-to

**User question:** "How do I authenticate the Rendobar CLI?"

Opens with `rb login`. Then the `--key` non-interactive form. Then `RENDOBAR_API_KEY` env var (highest priority, beats credentials file).

Source-of-truth facts (extracted from `src/lib/auth.ts`, `src/commands/login.ts`):

- OAuth PKCE flow. Browser opens, callback on `127.0.0.1:14832/callback`, scopes `openid media:full offline_access`.
- Credentials file: `~/.config/rendobar/credentials.json` (Linux/macOS, respects `XDG_CONFIG_HOME`) or `%APPDATA%/rendobar/credentials.json` (Windows).
- API key path: `rb login --key rb_live_...`. Keys must start with `rb_`.
- Env var: `RENDOBAR_API_KEY` — set in CI / containers / SSH.
- Token refresh: automatic when OAuth access token is within 60s of expiry. Refresh token stored alongside.
- Logout: `rb logout` revokes the refresh token (best-effort, 5s timeout) and deletes the credentials file.

### `cli/commands.mdx` — Reference

**User question:** "What flags does `rb ffmpeg` accept?"

Boring on purpose. No prose. One H2 per command. Each section has: usage line, flag table, example, exit codes (when distinct from the global table).

Sections in alphabetical order: `doctor`, `ffmpeg`, `login`, `logout`, `update`, `whoami`.

Top-level sections before commands: "Global flags" (`--json`, `--url-only`, `--quiet`, `--no-wait`) and "Exit codes" table:

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Job failed or generic error |
| 2 | User error (auth, validation, port in use) |
| 130 | Cancelled (SIGINT) |

`--timeout N` belongs to `rb ffmpeg` (parsed manually in `ffmpeg.ts`, not a true global flag).

### `cli/ci-cd.mdx` — How-to

**User question:** "How do I use the Rendobar CLI in CI?"

Opens with a 12-line GitHub Actions YAML using `RENDOBAR_API_KEY` from secrets. Then GitLab CI. Then a generic Docker section.

Sections:

1. Authenticate non-interactively (env var, not `rb login`)
2. Pin a CLI version (`RENDOBAR_VERSION=v1.0.0`)
3. Disable PATH modification in containers (`RENDOBAR_NO_MODIFY_PATH=1`)
4. Output modes for CI (`--json` for parsing, `--url-only` for piping to `wget`, `--quiet` + exit code for assertions)
5. Verify build provenance (`gh attestation verify`) — links to upstream `rendobar/cli` README
6. Idempotency keys (link to API reference)

### `cli/troubleshooting.mdx` — How-to

**User question:** "Why does my Rendobar CLI install / login / render fail?"

Each entry is a real symptom + fix. `<AccordionGroup>` for the matrix. Matrix entries (one per real failure mode in the source):

- "Port 14832 in use during `rb login`" → use `rb login --key rb_...`
- "macOS Gatekeeper blocks `rb`" → `rb doctor --fix` or `xattr -d com.apple.quarantine $(which rb)`
- "rb: command not found after install" → check `RENDOBAR_NO_MODIFY_PATH` was unset, restart shell, or re-run installer
- "Token timed out / refresh failed" → `rb logout && rb login`
- "Insufficient credits" → `rb` exits 2; top up via dashboard
- "GitHub rate limit hit during install or `rb update`" → set `RENDOBAR_GITHUB_TOKEN`
- "Update keeps offering the same version" → `rm ~/.rendobar/update-check.json`

Top of page: `rb doctor` runs eight checks (version, install method, OS/arch, update cache, API reachability, auth, macOS quarantine, GitHub rate limit). Run it first.

## SEO + agent-readability strategy

Everything Mintlify already gives us is in scope for free: per-page OG image, `.md` mirror at every URL, `/llms.txt`, `/llms-full.txt`, sitemap, canonical URLs, contextual menu (Copy / ChatGPT / Claude). **We do not rebuild any of this.**

What we control:

1. **Frontmatter `title` = the exact Google query.** Examples: "Install the Rendobar CLI", "Run FFmpeg from the CLI in CI", "Rendobar CLI commands reference".
2. **Frontmatter `description` = 140–160 chars** answering the query in one breath. No marketing words.
3. **`keywords` field** for alt phrasings. Example on overview: `["rb cli", "rendobar command line", "ffmpeg cli serverless"]`.
4. **First paragraph contains the answer.** LLMs and humans both reward front-loading. The Assistant's RAG sees flattened markdown, so the first paragraph is what it cites.
5. **No critical info inside `<Accordion>` or `<Tabs>`** — the flattener may skip it. Happy path stays top-level.
6. **Internal link density ≥ 3 per 1000 words.** First mention of every concept becomes a link to the right page (`/credits`, `/authentication`, `/job-types/raw-ffmpeg`).
7. **Code blocks have language tags.** Mintlify uses these for syntax highlighting and the LLM-friendly markdown export.
8. **No symmetric bullets, no three-synonym stacks, no "next-generation" — banned word list enforced.**

## Navigation placement

Add a new `"CLI"` group to `docs.json`, positioned between `"Guides"` and `"Concepts"`. Order: overview, installation, authentication, commands, ci-cd, troubleshooting.

```jsonc
{
  "group": "CLI",
  "pages": [
    "cli/overview",
    "cli/installation",
    "cli/authentication",
    "cli/commands",
    "cli/ci-cd",
    "cli/troubleshooting"
  ]
}
```

## Cross-links to add

| File | Add link to | Anchor text |
|---|---|---|
| `quickstart.mdx` § "What's next" | `/cli/overview` | "Rendobar CLI" |
| `guides/raw-ffmpeg.mdx` | `/cli/overview` | "the CLI" (one-line callout near top) |
| `authentication.mdx` | `/cli/authentication` | mention the CLI auth flow |

## Validation plan

1. `mint validate` — `docs.json` schema + OpenAPI sanity
2. `mint broken-links --check-anchors --check-external`
3. `mint a11y` — alt text + contrast
4. Manual: open `mint dev`, click every new page, click every internal link
5. Voice / slop scan: grep each new file for the banned-word list in `rules.md`
6. 90-second test on each page (read it as if at 2am with prod broken)

## Out of scope (named so we don't drift)

- A "what's new in v1.0.0" CLI changelog page. Lives in the CLI repo's GitHub Releases. We can mirror later.
- Per-command pages. Single `commands.mdx` is correct until command count > 10.
- Codegen from OpenAPI for CLI flags. Doesn't apply — flags are Citty-defined, not OpenAPI.
- A separate "verify provenance" page. One section in `ci-cd.mdx` is enough; link to the CLI repo for full instructions.
