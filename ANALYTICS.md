# Analytics (PostHog) — docs site

The docs use PostHog for **anonymous pageview analytics only**, wired carefully to
stay inside PostHog's free tier and to respect readers.

Config lives in `docs.json` under `integrations.posthog`:

```json
"integrations": {
  "posthog": {
    "apiKey": "phc_REPLACE_WITH_RENDOBAR_PROJECT_TOKEN",
    "apiHost": "https://e.rendobar.com",
    "sessionRecording": false
  }
}
```

## The careful choices

- **`sessionRecording: false`** — recordings are the scarce free-tier resource
  (5,000/month). The docs are public and high-traffic, so recording here would
  burn that budget fast for little product value. We record replay only in the
  authenticated dashboard, sampled. Docs get pageviews, not recordings.
- **`apiHost: https://e.rendobar.com`** — the first-party reverse proxy (a
  Cloudflare Worker in the main monorepo, `apps/posthog-proxy`). PostHog loads
  from our own domain, not a third-party host, so adblockers don't strip it and
  it reads as first-party. Same host the dashboard uses.
- **Anonymous** — docs readers are never identified. Pageviews are anonymous
  events (cheaper, lower-risk) and no person profile is created.

## Activation (one step)

Replace `phc_REPLACE_WITH_RENDOBAR_PROJECT_TOKEN` with the real PostHog **project
token** (public, write-only — safe to commit; it is the same key the web app
uses). Until then the block is inert: Mintlify loads PostHog but events go to an
unknown key and are dropped.

## Budget note

Anonymous docs pageviews draw from the 1,000,000 events/month pool, which has
wide headroom at our traffic. The $0 billing limit on the PostHog project is the
hard backstop: if docs traffic ever spiked past the free tier, ingestion stops
rather than incurring a charge. Watch the PostHog "billable usage" dashboard
after enabling; if docs pageviews grow large, we can add path-level sampling.
