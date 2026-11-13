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

## Phase 13 — Claude (candidates)

Ideas for Claude-specific work on the repo and the site, ranked. Nothing here is decided: Matt picks, then
each pick gets its own plan and PR from `main`. Rules carried over: Claude may run in the editor, CI or a
build script, but never when a visitor loads the site (the 2026-11-11 "no ask feature" decision), and
nothing deploys or touches the zone without an explicit go. Effort: S under a day, M a day or two, L more.

| #     | Idea                                                                                                                                                                                                                              | Effort | Needs                                         | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------- | ------ |
| 13.1  | MCP tool annotations: a `title` and `readOnlyHint` on all 8 tools in `worker/mcp.js` (none has them today), plus `outputSchema`. Claude auto-runs read-only tools; directory review requires them                                 | S      | A Worker deploy go                            | 🟡     |
| 13.2  | Repo skills in `.claude/skills/`: `ship-worker` (dry run, diff, deploy on an explicit go, verify live, note the rollback id), `zone-apply`, `qa-live`; a checked-in `.mcp.json` with the site's `/mcp` and the Cloudflare API MCP | S      | Nothing                                       | 🟡     |
| 13.3  | Use it from Claude: test `/mcp` as a No-sign-in custom connector, add a "Use with Claude" section, write the post "Making a portfolio agent-ready" as the public docs for a Community directory listing                           | S      | Matt adds the connector (his account)         | ⬜     |
| 13.4  | Scheduled routines: the CSP enforce-or-not check (from 2026-11-27), the AI Crawl Control comparison (2026-12-09), a weekly `pnpm check:agent-ready` diff                                                                          | S      | Nothing                                       | ⬜     |
| 13.5  | Subagents in `.claude/agents/`: `csp-reviewer` (inline script or style changes need new hashes), `lighthouse-triage` (runner flake or real regression); `numberOfRuns: 3` in `.lighthouserc*.cjs`                                 | S      | Matt's yes on the Lighthouse change           | ⬜     |
| 13.6  | Hook: PreToolUse guard that blocks hand edits to files `pnpm check:generated` owns; optional Stop hook running `pnpm validate`                                                                                                    | S      | Nothing                                       | ⬜     |
| 13.7  | Plugin marketplace in its own repo: the portfolio skill plus the `/mcp` config, installable with `claude plugin marketplace add`                                                                                                  | M      | A new repo                                    | ⬜     |
| 13.8  | Eval suite for `/mcp` and the agent skill: does Claude answer portfolio questions correctly through the tools? CI, report only                                                                                                    | M      | `ANTHROPIC_API_KEY` or an OAuth token secret  | ⬜     |
| 13.9  | Build-time generation in `update-github-data.yml`: image alt text, post TL;DRs, a copy lint against the style rules; output checked in and reviewed in the PR                                                                     | M      | The same secret; Matt's review of the output  | ⬜     |
| 13.10 | MCP Apps: a project card and the status panel rendered inside Claude (`@modelcontextprotocol/ext-apps`, `ui.domain` for `/mcp`)                                                                                                   | M–L    | A bundle-size spike (Worker is 1.25 MiB)      | ⬜     |
| 13.11 | `anthropics/claude-code-action@v1` for `@claude` on PRs and issues                                                                                                                                                                | S      | The secret; check overlap with Copilot review | ⬜     |

Order: 13.1 first (cheap, and 13.3, 13.7 and 13.10 build on it), then 13.2 to 13.6, which need nothing from
outside the repo. 13.8, 13.9 and 13.11 wait on a CI secret (the repo has only `CLOUDFLARE_PURGE_TOKEN`,
`GHA_TOKEN` and `SONAR_TOKEN`).

Cost of the build-time items (estimate, not measured): a full run of 13.9 over about 30 READMEs, the post
TL;DRs and image alt text is roughly 150k input and 20k output tokens. At cached list prices that is about
$0.03 on Haiku 5.5 ($0.10/$0.50 per MTok), $0.50 on Sonnet 5.5 ($2/$10) or $1.00 on Opus 5.5 ($4/$20).
Runs are daily and only when inputs change, so most days cost cents. At this size neither Batches (50% off,
asynchronous) nor prompt caching (the shared prompt is below the minimum cacheable prefix) is worth the
complexity.

Dropped: any Claude call at visitor time (conflicts with the 2026-11-11 decision), and per-visitor
personalisation (conflicts with the Phase 12 "no visitor tracking" decision).

## Decision Log

Older entries (2026-06 to 2026-11-11, including all of Phase 10) are in
[docs/ROADMAP-archive.md](docs/ROADMAP-archive.md).

- **2026-11-13** — Phase 13 (Claude candidates) drafted, not started. Findings that shaped it: the live
  `/mcp` has 8 tools and none carries `title` or `readOnlyHint`; claude.ai accepts a No-sign-in remote MCP
  server over Streamable HTTP, but one GitHub issue reports it forcing OAuth, so test it live before
  promising it; the directory needs annotations, narrow tool descriptions and public docs, and test
  credentials do not apply to an authless server; MCP Apps work in Claude, but embedded sites and entry
  points need a Verified listing.

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
