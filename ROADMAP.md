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

| #     | Idea                                                                                                                                                                                                                                                                                | Effort | Needs                              | Status        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------- | ------------- |
| 13.1  | MCP tool annotations: a `title` and `readOnlyHint` on all 8 tools in `worker/mcp.js` (none has them today), plus `outputSchema`. Claude auto-runs read-only tools; directory review requires them                                                                                   | S      | A Worker deploy go                 | ✅ 2026-11-14 |
| 13.2  | Repo skills in `.claude/skills/`: `ship-worker` (dry run, diff, deploy on an explicit go, verify live, note the rollback id), `zone-apply`, `qa-live`; a checked-in `.mcp.json` with the site's `/mcp` and the Cloudflare API MCP                                                   | S      | Nothing                            | ✅ 2026-11-13 |
| 13.3  | Use it from Claude: test `/mcp` as a No-sign-in custom connector, add a "Use with Claude" section, write the post "Making a portfolio agent-ready" as the public docs for a Community directory listing                                                                             | S      | Matt reads the post, then merge    | ✅ 2026-11-14 |
| 13.4  | Dated follow-ups as issues opened by `scripts/follow-ups.mjs` from `site-check.yml`: the CSP enforce-or-not check (from 2026-11-27) and the AI Crawl Control comparison (2026-12-09), (the weekly scan diff was dropped: `site-check.yml` already runs `check:agent-ready` daily)   | S      | Nothing                            | ✅ 2026-11-13 |
| 13.5  | Subagents in `.claude/agents/`: `csp-reviewer` (inline script or style changes need new hashes), `lighthouse-triage` (runner flake or real regression) (`numberOfRuns: 3` was already in `.lighthouserc*.cjs`)                                                                      | S      | Nothing                            | ✅ 2026-11-13 |
| 13.6  | Hook: PreToolUse guard that blocks hand edits to files `pnpm check:generated` owns (the optional Stop hook running `pnpm validate` was left out: it would run the whole gate on every turn)                                                                                         | S      | Nothing                            | ✅ 2026-11-13 |
| 13.7  | Plugin marketplace in its own repo: the portfolio skill plus the `/mcp` config, installable with `claude plugin marketplace add` Dropped 2026-11-15: the skill and the connector already install from the site and `/mcp`, so a second repo to keep in step is not worth it         | M      | Nothing                            | ❌            |
| 13.8  | Eval suite for `/mcp` and the agent skill: does Claude answer portfolio questions correctly through the tools? CI, report only                                                                                                                                                      | M      | Nothing                            | ✅ 2026-11-15 |
| 13.9  | Copy lint: `pnpm check:copy` is in `validate` (no gendered pronouns about Matt). Alt text audited 2026-11-15: every screenshot has hand-written alt and the generated covers are decorative (`alt=""`), so nothing to generate. Post TL;DRs dropped: posts already have a `summary` | M      | Nothing                            | ✅ 2026-11-14 |
| 13.10 | MCP Apps: a project card and the status panel rendered inside Claude (`@modelcontextprotocol/ext-apps`, `ui.domain` for `/mcp`) Live as `show_project` (#313): +4.3 KiB bundle, the card renders in claude.ai as Unverified, no directory listing needed                            | M–L    | Nothing                            | ✅ 2026-11-15 |
| 13.11 | `anthropics/claude-code-action@v1` for `@claude` on PRs and issues                                                                                                                                                                                                                  | S      | Test on a PR; compare with Copilot | ✅ 2026-11-14 |

Order: 13.1 first (cheap, and 13.3 and 13.10 build on it), then 13.2 to 13.6, which need nothing from outside the
repo, then 13.8, 13.9 and 13.11 once `CLAUDE_CODE_OAUTH_TOKEN` was added on 2026-11-15 (the repo also has
`CLOUDFLARE_PURGE_TOKEN`, `GHA_TOKEN` and `SONAR_TOKEN`).

Cost: nothing here calls Claude at visitor time. The only spend is on the Claude subscription: the weekly MCP
eval (five short Haiku 5.5 sessions) and any `@claude` run. The build-time generation priced in the first draft
was not built (13.9 found nothing to generate), so that estimate is moot.

Dropped: any Claude call at visitor time (conflicts with the 2026-11-11 decision), and per-visitor
personalisation (conflicts with the Phase 12 "no visitor tracking" decision).

## Phase 14 — Faster, live, first-party

What the 2026-11-15 re-audit recommended, in the order to do it. One PR per item from `main`. Rules carried
over: nothing calls Claude at visitor time, nothing published counts or places visitors, GitHub Pages stays
the origin, and nothing deploys or touches the zone without an explicit go. Effort: S under a day, M a day
or two, L more.

| #    | Item                                                                                                                                                                                                                                                                                                                                                 | Effort | Needs                                                                        | Status                            |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------- | --------------------------------- |
| 14.0 | Backlog sweep, site and scripts only: the feed icon and `check:refs` reading `feed.xml` and `sitemap.xml` (#217), stale comments (#236), the `shortcuts-doctor` copy (#235), dead code and the hour-long rate-limit wait (#230, #225), the hero reseeding on a phone's URL bar (#226), one language-colour table and one relative-time helper (#229) | S      | Nothing                                                                      | ✅ 2026-11-15                     |
| 14.1 | Cron-warmed snapshots (#319): the five-minute cron refreshes `/activity` and `/stats` into KV, requests only read. With it: a "no such project" answer stops counting as a tool error (#318), and the guestbook's legacy migration goes                                                                                                              | S      | A Worker deploy go                                                           | ✅ 2026-11-15                     |
| 14.2 | Typed MCP results (#320): an `outputSchema` and `structuredContent` on all nine tools, the card reads the typed result, `SERVER_VERSION` moves                                                                                                                                                                                                       | S      | The same deploy as 14.1                                                      | ✅ 2026-11-15                     |
| 14.3 | The status panel inside Claude: `show_status`, a second MCP App drawn from `get_site_stats` (uptime strip, Web Vitals, API latency). The half of 13.10 that did not ship                                                                                                                                                                             | M      | 14.2; a Worker deploy go                                                     | ✅ 2026-11-15                     |
| 14.4 | State on the Durable Object: an atomic views counter in `Presence`'s SQLite, seeded from the KV value (closes #211)                                                                                                                                                                                                                                  | M      | A Worker deploy go                                                           | ✅ 2026-11-15                     |
| 14.5 | Prerender on hover: the site's own speculation rules (`moderate`, project and post pages) on top of Speed Brain's prefetch, with the view count, presence and the edge receipt held back while `document.prerendering`                                                                                                                               | S      | `pnpm zone --only headers --apply` (the CSP must allow the rules)            | ✅ 2026-11-15                     |
| 14.6 | WebGPU hero: the flow field as a compute shader, the WASM sim as the fallback, behind the same `canRunHeavyEffects()` gate. Kept only if it beats the WASM frame rate and stays inside the budgets                                                                                                                                                   | M–L    | Nothing                                                                      | ✅ opt-in `?hero=gpu`, 2026-11-15 |
| 14.7 | First-party contact form: `POST /api/contact` with Turnstile and the `send_email` binding to a verified address; Formspree leaves the form and the CSP                                                                                                                                                                                               | M      | Matt: Email Routing on the zone and a verified address; a deploy; zone apply | ❌ dropped 2026-11-15             |
| 14.8 | Test hygiene (#234): a coverage report, web-first waits in place of the short sleeps, a WASM drift check in `check:generated`, lint-staged on `.mjs`, `.cjs` and `.html`                                                                                                                                                                             | S–M    | Nothing                                                                      | ✅ 2026-11-15                     |

Order: 14.0 first (no deploy, closes six issues), then 14.1 and 14.2 in one deploy, 14.3 and 14.4 in a
second, 14.5 and 14.6 on the site alone, 14.7 last because it waits on the dashboard. 14.8 fits anywhere.

How each is checked, since a number is the point of most of them:

- **14.1**: `/activity` and `/stats` p95 under 100 ms in `portfolio_metrics` (2,876 ms and 4,396 ms over
  the two days before), and a failed refresh never overwrites a good value. The eval's "zzz-not-a-project"
  question no longer shows as an error on `/status/`.
- **14.4**: two hundred overlapping `POST /views` in a test add exactly two hundred. The KV value is read
  once to seed the counter and KV stays as it is until the count has matched for a week.
- **14.5**: a prerendered page opens no socket and posts no view until it is shown (an e2e test with
  `document.prerendering` stubbed). Speed Brain only prefetches from the cache and never runs the Worker, so
  nothing is double-counted today; prerendering runs scripts, which is why the guards come first.
- **14.6**: frames per second from the HUD on the same machine, both paths, and `budgets.spec.js` unchanged.
- **14.7**: before anything, `dig MX andernet.dev`: turning on Email Routing adds MX records, so if the
  domain already receives mail somewhere else this item stops there. The Formspree form stays as the
  no-JavaScript path until a real message has arrived through the Worker.

Not planned, because each reverses a decision: moving the GitHub data out of git (a Worker cron in place of
the daily commit and deploy) and replacing the GitHub Pages origin with Workers Static Assets.

## Phase 15 — Lab

Experimental and cutting-edge work, each experiment off by default behind a flag and listed on `/lab/` with
what it needs and what was measured. One PR per item from `main`. Decisions (2026-11-15): all four tracks
(agent frontier, live and shared, platform-native, on-device AI); the browser's own built-in model is allowed
as an opt-in experiment, no server-side model runs for visitors; platform-native items are refactors with a
fallback, not flags. Every row needs a measure and a drop condition before code, and a support check in real
browsers first (several statuses changed this year and sources disagree). Nothing deploys or touches the
zone without an explicit go. Effort: S under a day, M a day or two.

| #     | Item                                                                                                 | Effort | Needs         | Status |
| ----- | ---------------------------------------------------------------------------------------------------- | ------ | ------------- | ------ |
| 15.0  | Lab scaffold: `lab()` flag helper, `lab-data.json`, generated `/lab/` page with switches             | S      | Nothing       | 🟡     |
| 15.1  | MCP prompts and resources                                                                            | S      | Worker deploy | 🟡     |
| 15.2  | Signed agents (Web Bot Auth) as one more field on `/status/`; check `request.cf` first               | M      | Worker deploy | 🟡     |
| 15.3  | "View as agent" switch (the service worker must never cache Markdown under an HTML URL)              | S–M    | Nothing       | 🟡     |
| 15.4  | `show_project` and `show_status` in ChatGPT, VS Code and Goose; matrix in the agent-ready post       | S      | Matt          | ⬜     |
| 15.5  | Shared flow field over the presence socket (a deliberate change: sockets may now send, rate-limited) | M      | Worker deploy | 🟡     |
| 15.6  | Hero of the day: seed from the UTC day (lab switch `hero-seed`), `?seed=` permalink                  | S      | Nothing       | 🟡     |
| 15.7  | HDR for the GPU hero (`rgba16float`, extended tone mapping)                                          | S      | Nothing       | 🟡     |
| 15.8  | Sound, only if 15.5 or 15.6 lands well                                                               | S–M    | Nothing       | ⬜     |
| 15.9  | Declarative dialogs and menus (`command` / `commandfor`, `popover`)                                  | S–M    | Nothing       | 🟡     |
| 15.10 | Trusted Types in the report-only CSP                                                                 | S–M    | Zone apply    | 🟡     |
| 15.11 | CSS in place of script (anchor positioning, scroll-driven animation, `interpolate-size`)             | S–M    | Nothing       | 🟡     |
| 15.12 | Back/forward cache: close the presence socket on `pagehide`                                          | S      | Nothing       | ⬜     |
| 15.13 | On-device post tools: Summarizer, Translator                                                         | S–M    | Nothing       | 🟡     |
| 15.14 | On-device "ask the portfolio": the model picks slugs, the site shows its own copy                    | M      | Nothing       | ⬜     |

Order: 15.0, then the site-only wins (15.6, 15.7, 15.3, 15.13), one Worker deploy (15.1, 15.5, 15.2), one zone
apply (15.10), the refactors (15.9, 15.11, 15.12), and 15.14 last. Parked: import-map integrity (an inline
import map means a CSP hash per module edit; Safari 26.6 has an open blank-page bug), anything with a
server-side model at visitor time, paid or OAuth agent protocols, ActivityPub or AT Protocol identity.

## Decision Log

Older entries (2026-06 to 2026-11-11, including all of Phase 10) are in
[docs/ROADMAP-archive.md](docs/ROADMAP-archive.md).

- **2026-11-15** — Phase 15 (Lab) planned, 15.0 built. The 2026-11-11 "no ask feature" decision is narrowed: the
  browser's own built-in model may run as an opt-in experiment (nothing leaves the device, no cost); no
  server-side model runs for visitors, and Claude still never runs at visitor time. Experiments live behind
  `?lab=<name>` or a switch on `/lab/` (saved in `localStorage` only); `?hero=gpu` stays as an alias of
  `hero-gpu`. The default page never loads one, and an e2e test checks.

- **2026-11-15** — Phase 14 planned from a re-audit, not started. Matt's brief: whatever the audit recommends
  that fits the project. The audit re-checked the nine open issues against `main` (most shrank after Phase
  10; each has a dated comment) and filed #318 to #320. Findings that shaped the plan: **(1)** `/activity`
  and `/stats` p95 were 2.9 s and 4.4 s, because the Cache API is per location and at this traffic almost
  every request is a miss; the cron already runs every five minutes. **(2)** The one CSP report so far is
  `script-src` blocking `eval` on `/` (2026-11-13, once); the site has no `eval`, so it reads as an extension
  or an old browser treating WASM as eval. One more input for the 2026-11-27 enforce-or-not issue. **(3)**
  Speed Brain is already on (`Speculation-Rules: "/cdn-cgi/speculation"`, conservative prefetch from cache
  only), so 14.5 adds prerendering, not prefetching. **(4)** 14.4 changes the 2026-11-11 "views stay on KV"
  decision: that was made before the Worker had a Durable Object. **(5)** Sending to a verified destination
  address with `send_email` is free on any plan, but needs Email Routing on the zone.

- **2026-11-15** — Phase 14 closed; 14.7 (first-party contact form) dropped. Its stop condition was met:
  `andernet.dev` receives mail through an iCloud custom domain (MX `mx01` and `mx02.mail.icloud.com`, SPF
  `include:icloud.com`, two `apple-domain=` records, no DMARC), and Cloudflare Email Routing needs its own MX records
  on the root, which would replace those and break that mail. Cloudflare Email Sending on a subdomain (for example
  `mail.andernet.dev`) would have avoided that, but it is Beta, and Formspree works: the gain was one fewer
  third-party service, against a new beta dependency and an endpoint to keep spam-proof. If the form is ever
  replaced, start from the subdomain route and do not touch the root's MX. Phase 14 in short: 14.0 to 14.5 and 14.8
  shipped, 14.6 shipped opt-in (`?hero=gpu`), 14.7 dropped. Left open from the audit on purpose: #225, #226, #229,
  #230, #234 (Stylelint for inline `<style>` blocks) and #236 (what remains of each is in its comments) and #5 (the
  Renovate dashboard).

- **2026-11-15** — 14.6 (WebGPU hero) built as an opt-in experiment, not made the default. Measured on an Apple
  GPU (Metal) in Chromium at 2x scale: the WASM field's main-thread cost per frame is 0.8 ms at 3,000 particles,
  1.9 ms at its 14,000 cap, 5.5 ms at 50,000 and 15.5 ms at 150,000, which is its wall at 60 fps. The GPU field holds
  60 fps from 3,000 to 1,000,000 particles, at 2.5 to 7.8 ms of GPU time a frame and almost nothing on the main
  thread. So the rule "kept only if it beats WASM" is met only as headroom: at the site's own density (about a
  thousand particles) the WASM field costs under a millisecond and nothing is gained; what the GPU adds is a field
  fifty to a hundred times denser, at the same cost (it looks like fine hair-lines, see `?hero=gpu&particles=60000`).
  Kept off by default because it has only been seen on one GPU, WebGPU is not everywhere, and a canvas that takes a
  WebGPU context cannot go back to 2D. Two findings to keep: the first benchmark (vsync off) made the GPU look
  500 ms a frame because thousands of frames queued up, so GPU cost has to be measured paced at the display rate; and
  additive strokes at 60,000 particles saturated to white through the headline until the stroke opacity was scaled by
  `sqrt(2500 / count)`. Making it the default would need a decision on the density and a look at it on a non-Apple GPU.

- **2026-11-15** — 14.3 to 14.5 shipped. The status panel (`show_status`) renders in Claude Desktop, marked
  Unverified like the project card. Getting there cost a detour worth keeping: 14.3 added the tenth tool without
  bumping `SERVER_VERSION`, and a Desktop session kept listing nine tools after a reconnect; bumping to 1.2.0
  (#327) and starting a new chat fixed it, and a test now pins the version to the tool list. The model in the
  chat cannot see the UI, so what Claude says about a card is not evidence of whether it drew; look at the
  screen. Prerender on hover is live: the rules are hashed into the CSP (the `'inline-speculation-rules'`
  keyword did not satisfy Chromium here) and the zone was applied on 2026-11-15. Playwright cannot watch a
  prerender succeed (Chromium disables it while DevTools is attached), so the e2e checks that the browser accepts
  the rules and tries one on hover.

- **2026-11-15** — 14.4 narrowed. The views counter moves to its own SQLite Durable Object class (`Counter`,
  not `Presence`: a separate class keeps the sockets' object out of the request path), seeded from KV, with KV
  written every 10th count. The planned "new version is live" message over the presence socket was dropped: the
  object hibernates, and a hibernated object does not run its constructor on a deploy, so the message would only
  go out when someone next connected, which is not "live". It would need the deploy workflow to call the Worker
  with a secret. Not worth it for a toast the service worker already shows. 14.1 and 14.2 were deployed as Worker
  `6f275d34` (rollback `cb9ffa35`); `/activity` and `/stats` went from p95 2.9 s and 4.4 s to about 0.1 s.

- **2026-11-15** — Phase 13 (Claude) shipped, except 13.7 (dropped). Claude can now use the site three ways:
  as a claude.ai custom connector (`/mcp`, No sign-in; all 8 tools show as read-only with titles), through
  `show_project`, a ninth tool that draws a project card inside Claude (an MCP App; it renders marked
  Unverified, no directory listing needed, +4.3 KiB on the Worker), and through the post "Making a portfolio
  agent-ready". In the repo, Claude Code has three skills, two subagents, a hook that blocks hand edits to
  generated files, and `.mcp.json`; GitHub has an `@claude` workflow (it answered on #309 in 26 seconds) and
  a weekly MCP eval that checks portfolio answers and that the agent skill agrees with the live tools. Things
  worth remembering: **(1)** nothing calls Claude at visitor time (the 2026-11-11 decision held); Claude runs
  only in Matt's sessions and in CI on `CLAUDE_CODE_OAUTH_TOKEN`. **(2)** `@claude` uses the workflow's own
  `GITHUB_TOKEN`, so no GitHub App is installed, and commits it pushes do not start other workflows. **(3)**
  `wrangler deploy` can upload a version and then fail at the deployments step (Cloudflare error 10013 during
  an incident, about 28 hours); `wrangler versions deploy <id>@100%` finishes it. **(4)** `/ship-worker` and
  `zone-apply` only run when Matt types them: Claude cannot invoke them. **(5)** `pnpm check:copy` is part of
  `validate`: no gendered pronouns about Matt anywhere visitors, crawlers or agents read. **(6)** 13.9 found
  nothing to generate: every screenshot already has hand-written alt text, covers are decorative on purpose,
  and posts have a `summary`. **Still to do:** the follow-up issues open themselves on 2026-11-27 (CSP
  enforce-or-not) and 2026-12-09 (crawler comparison); check the one `script-src` CSP report's blocked URI
  before the first; compare `@claude` with Copilot's review once there is more than one run; and, if wanted,
  tell Claude in the `show_project` description that the card is shown to the user, so it stops repeating
  the data (needs a Worker deploy).

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
