# Portfolio Roadmap

Multi-phase plan for the next round of work on the portfolio. Status is kept current as
items are worked. Worker items deploy via Cloudflare/Wrangler, separate from the GitHub
Pages static deploy.

Status legend: ⬜ not started · 🟡 in progress · ✅ done · ❌ dropped

Phases 1–10 are complete; their tables and decision log are in
[docs/ROADMAP-archive.md](docs/ROADMAP-archive.md). (There was no Phase 9 table: it was a
tech-debt cleanup pass recorded only in the log.)

## Phase 11 — Agent readiness

Make the site readable and queryable by AI agents and tighten the Cloudflare setup. One PR per
item from `main`. Decisions (2026-11-11): AI training crawlers allowed; a read-only portfolio MCP
server on the Worker and WebMCP in-page tools; no AI "ask" feature; zone settings applied by a
checked-in script.

| #    | Item                                                                              | Status        |
| ---- | --------------------------------------------------------------------------------- | ------------- |
| 11.0 | Zone settings as code (`scripts/cloudflare-zone.mjs`, `pnpm zone`) — #264         | ✅ 2026-11-12 |
| 11.1 | Crawl policy, `robots.txt`, generated `llms.txt`, cleaner Markdown — #262         | ✅ 2026-11-12 |
| 11.2 | Worker on `andernet.dev/api/*`, so the page calls it same-origin — #267           | ✅ 2026-11-12 |
| 11.3 | Discovery documents and the read-only MCP server (`/mcp`, `/.well-known/`) — #270 | ✅ 2026-11-12 |
| 11.4 | Zone rules: `Link` headers, HSTS, security headers, report-only CSP — #272        | ✅ 2026-11-12 |
| 11.5 | WebMCP in-page tools — #274                                                       | ✅ 2026-11-12 |
| 11.6 | Scanner report in CI (`check:agent-ready`), document; compare crawler data        | 🟡 2026-11-12 |

## Phase 12 — Edge observability

Make the site report on itself, and show it. One PR per item from `main`. Decisions (2026-11-12): build
the public `/status/` page, a footer "edge receipt" and a live "N here now"; publish performance,
reliability and agent activity only (no human visit counts over time, no geography); stay on GitHub
Pages as the origin.

| #    | Item                                                                                                                                | Status        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 12.0 | Access and baseline: a token that can read analytics, cache rules and tracing                                                       | ✅ 2026-11-12 |
| 12.1 | Worker telemetry: traces, Issues, source maps, `portfolio_metrics`, `Server-Timing` — #277                                          | ✅ 2026-11-12 |
| 12.2 | Footer edge receipt, `GET /api/edge` — #278                                                                                         | ✅ 2026-11-12 |
| 12.3 | HTML cached at the edge for an hour, purged by hostname on every deploy — #279                                                      | ✅ 2026-11-12 |
| 12.4 | `/api/stats`, the uptime probe and `get_site_stats` (#280); the public `/status/` page (#282)                                       | ✅ 2026-11-13 |
| 12.5 | "N here now" on a hibernating Durable Object — #283                                                                                 | ✅ 2026-11-13 |
| 12.6 | Report-only CSP reports (#284), switched on and counted on `/status/` (#285)                                                        | ✅ 2026-11-13 |
| 12.7 | Alerts: the silent-probe gate (`pnpm check:probe`, daily); the Monitors, a Health Check and an Issues automation are dashboard-only | 🟡 2026-11-13 |

## Decision Log

Older entries (2026-06 to 2026-11-11, including all of Phase 10) are in
[docs/ROADMAP-archive.md](docs/ROADMAP-archive.md).

- **2026-11-13** — Phase 12 (edge observability) shipped, except the dashboard alerts. The Worker writes
  one Analytics Engine point per API request and MCP tool call (a fixed route, status, time and a
  browser/agent guess: no address, no user agent), probes the home page every five minutes, and has traces
  and Issues on. `/api/stats` (cached five minutes, queries fixed, any section `null` when it cannot be read)
  feeds `/status/` and the `get_site_stats` MCP tool. Things worth remembering: **(1)** published numbers
  never include request counts (mostly visitors' browsers), human sample sizes or places; Web Vitals are for
  real visitors only (the first LCP p75, 6.96 s, was all bots; humans are 0.44 s) and each needs 20 measured
  samples (INP is unavailable until then; the API reports "could not measure" as -1, and a percentile over
  those reads 16 ms where the measured visits say 40). **(2)** A zero is only evidence once the thing could
  report: the CSP report count shows a dash until `CSP_REPORTING_SINCE` is set, and the setting is only set
  after the live header is seen to carry `report-uri`. **(3)** Zone queries must filter
  `requestSource = 'eyeball'`: about 8% of logged requests are Cloudflare's own Early Hints probing, mostly
  logged as 504s. Counting only visitors, 10 of 11,210 requests in a day were 5xx (503 and 522 on pages, the
  GitHub Pages origin): 99.91% availability that the Worker's own numbers (zero errors) never see. **(4)**
  Monitors cannot fire on "no data", so a probe that goes quiet is caught by `pnpm check:probe`, a daily gate in
  `site-check.yml`. **(5)** HTML is cached an hour at the edge and purged by hostname twice after every deploy
  (the second a safety net for GitHub's CDN); workflow runs queue, they are not cancelled, so a purge cannot be
  skipped. **(6)** Every e2e test mocks the Worker (`mockWorker` in `tests/e2e/fixtures.js`), a unit test
  enforces it: before, two specs were calling the production Worker, including `POST /views`. **Still to do,
  by hand:** the three Monitors, a Health Check on the origin and an Issues automation (definitions in
  `AGENTS.md`); trim the zone API token (it can read DNS); and after about two weeks of CSP reports (from
  2026-11-27), decide whether to enforce the policy. A steady zero is the evidence, and enforcing is a
  separate decision.

- **2026-11-12** — Phase 11 (agent readiness) shipped: Agent Readiness scan went from level 3 to 4 of 5,
  and `webMcp` passes. AI training crawlers are allowed (`robots.txt` carries the Content Signals, because
  Cloudflare's managed block disappears once every AI policy is Allow). The Worker now answers on
  `andernet.dev` (`/api/*`, `/mcp`, four `/.well-known/` documents) with a read-only MCP server; WebMCP tools
  load only in browsers that have `document.modelContext`, and the contact tool drafts but never sends.
  Zone settings are code (`pnpm zone`), and rules are scoped to the apex host because the zone also carries
  about twenty other apps. SSL is `full`, never `strict` (GitHub Pages has no certificate for the domain).
  The CSP is **report-only** with no report endpoint; enforcing it is a separate decision. Five scanner checks
  stay failing on purpose (OAuth x2, auth.md, A2A agent card, DNS-AID): nothing here needs signing in. A daily
  report-only CI job (`pnpm check:agent-ready`) prints the level and flags any other failure; it never fails
  the build. **Still to do:** compare AI Crawl Control (crawler mix, bot 404s, referrals) with the
  2026-11-11 baseline after two to four weeks, around 2026-12-09.
