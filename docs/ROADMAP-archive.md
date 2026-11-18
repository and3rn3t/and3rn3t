# Roadmap archive

Completed phases and older decision-log entries, moved out of [ROADMAP.md](../ROADMAP.md) to keep it
short. Open phases and the newest entries stay in the roadmap.

Status legend: ⬜ not started · 🟡 in progress · ✅ done · ❌ dropped

## Completed phases

### Phase 1 — Foundation + quick wins

| #   | Item                                                                                                                                    | Status        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1.1 | Create this ROADMAP.md                                                                                                                  | ✅ 2026-06-13 |
| 1.2 | Real contribution heatmap (extend `update-github-data.yml` → render `#contribution-graph`)                                              | ✅ 2026-06-13 |
| 1.3 | Real language proficiency from repo language bytes (workflow still writes `languageBytes`; on-page bars removed in the streamline pass) | ❌ superseded |
| 1.4 | Perf polish — modulepreload (✅), canvas DPR cap (already done), `content-visibility` (rejected)                                        | ✅ 2026-10-04 |

### Phase 2 — Signature wow features

| #   | Item                                                                                                         | Status          |
| --- | ------------------------------------------------------------------------------------------------------------ | --------------- |
| 2.1 | Case-study deep dives — long-form in `projects-data.json` + accessible modal in `projects.js`, deep-linkable | ✅ 2026-06-13   |
| 2.2 | Live "currently coding" widget (Worker + GitHub events, static fallback)                                     | ✅ 2026-06-13   |
| 2.3 | Dynamic OG images (Worker SVG — portfolio + per-project cards)                                               | ❌ removed #228 |

### Phase 3 — Content & credibility

| #   | Item                                                                                      | Status        |
| --- | ----------------------------------------------------------------------------------------- | ------------- |
| 3.1 | Blog / writing section (posts-data.json, modules/blog.js, in-page article view, feed.xml) | ✅ 2026-06-13 |
| 3.2 | Experience / timeline section (experience-data.json, modules/experience.js)               | ✅ 2026-06-13 |
| 3.3 | Testimonials section (static data)                                                        | ❌ dropped    |
| 3.4 | Resume integration — prominent CTA + schema.org Person JSON-LD                            | ✅ 2026-06-13 |

### Phase 4 — Engagement & data

| #   | Item                                                                                                                             | Status        |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 4.1 | View counts (Worker + KV — POST /views increments, footer widget shows count)                                                    | ✅ 2026-06-13 |
| 4.2 | Guestbook (Worker + KV + Turnstile — /guestbook GET/POST, in-page section)                                                       | ✅ 2026-06-13 |
| 4.3 | Cloudflare Web Analytics beacon live (token already embedded in index.html)                                                      | ✅ 2026-06-13 |
| 4.4 | Real GitHub activity feed (Worker `/activity` kept for the currently-coding widget; feed section removed in the streamline pass) | ❌ superseded |

### Phase 5 — Quality & infra guardrails

| #   | Item                                                                              | Status        |
| --- | --------------------------------------------------------------------------------- | ------------- |
| 5.1 | Lighthouse CI workflow with perf/a11y budgets                                     | ✅ 2026-06-13 |
| 5.2 | Vitest unit tests (github-api cache/retry, capabilities, fuzzy search)            | ✅ 2026-06-13 |
| 5.3 | Playwright e2e for interactive: Cmd-K palette, `?` help, theme picker, Konami egg | ✅ 2026-06-13 |
| 5.4 | axe-core a11y check in CI                                                         | ✅ 2026-06-13 |
| 5.5 | Worker tests (vitest + miniflare) once a Worker exists                            | ✅ 2026-06-13 |

### Phase 6 — WebAssembly (compute core)

Hybrid architecture: a thin JS host shell with a Rust/AssemblyScript→WASM core for the
few genuinely compute/visual-heavy pieces. WASM is always lazy-loaded + capability-gated,
and every feature keeps its existing JS/CSS fallback. See `assembly/`, `modules/wasm/`.

| #   | Item                                                                                                                                                                                                | Status        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 6.1 | WASM toolchain (AssemblyScript) wired into Vite build + lazy load (`asconfig.json`, `build:wasm`)                                                                                                   | ✅ 2026-06-28 |
| 6.2 | Hero particle flow-field compute core in WASM (`assembly/hero-sim.ts` + `modules/wasm/hero-sim.js`)                                                                                                 | ✅ 2026-06-28 |
| 6.3 | `wasm-lab.html` interactive showcase + live FPS/particle HUD (measured: 3.5k particles @ 120fps)                                                                                                    | ✅ 2026-06-28 |
| 6.4 | WASM hero shipped live: `initHeroEnhancements` mounts the flow-field first, falling back to the WebGL shader then CSS (`main.js`); transparent `destination-out` trails composite over the gradient | ✅ 2026-06-28 |
| 6.5 | Edge OG images via a Rust WASM rasterizer (port `worker/og.js` → PNG), SVG kept as fallback                                                                                                         | ❌ dropped    |

### Phase 7 — Streamline

| #   | Item                                                                          | Status        |
| --- | ----------------------------------------------------------------------------- | ------------- |
| 7.1 | Remove dead weight (Chart.js, testimonials, skills matrix, stale docs) — #109 | ✅ 2026-10-04 |
| 7.2 | Merge Skills + GitHub stats into About; Projects before Experience — #110     | ✅ 2026-10-04 |
| 7.3 | Six featured projects + "Show more" expander — #111                           | ✅ 2026-10-04 |
| 7.4 | Fix closed mobile nav menu blocking every tap — #113                          | ✅ 2026-10-06 |
| 7.5 | Guestbook into Contact tabs; single light/dark toggle — #114                  | ✅ 2026-10-06 |
| 7.6 | Copy pass: de-duplicate hero/About/intros; correct "How This Site Works" post | ✅ 2026-10-06 |

### Phase 8 — UX pass

| #   | Item                                                                                                              | Status        |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| 8.1 | Service worker serves fresh code (SWR/network-first, deploy-stamped cache); deep links no longer throw — #128     | ✅ 2026-10-09 |
| 8.2 | First paint: no opacity gate, Inter subset, Font Awesome → SVG sprite, one data fetch — #130                      | ✅ 2026-10-09 |
| 8.3 | Remove analytics/performance/mobile modules; one scroll owner; scroll-spy fix; `<main>` — #131                    | ✅ 2026-10-09 |
| 8.4 | Mobile polish: navbar theme toggle, contact form, card copy, contrast — #132                                      | ✅ 2026-10-09 |
| 8.5 | Static post pages (`/posts/<slug>/`), feed and sitemap generated from `posts-data.json`                           | ✅ 2026-10-09 |
| 8.6 | Project screenshots in cards/case studies; View Transitions for modal and post navigation (done in 10.2 and 10.4) | ✅ 2026-11-11 |

### Phase 10 — Signature redesign

Plan: pre-render the curated content, then a new visual identity, real project pages and a
slimmer stylesheet. Phases 0–1 shipped on `main`; 2–6 landed on a `redesign` branch and went to `main`
in one cut-over (10.6c below).

| #    | Item                                                                                                          | Status        |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| 10.0 | Quick fixes: modal gaps, mobile heatmap, theme colours, head cleanup — #246                                   | ✅ 2026-11-11 |
| 10.1 | Pre-render projects, experience and writing into `index.html`; readable without JS — #247                     | ✅ 2026-11-11 |
| 10.2 | Design system (tokens, type, `light-dark()`), screenshot capture, new nav + hero + lead card                  | ✅ 2026-11-11 |
| 10.3 | Home sections on the new system: work, about/experience/writing, contact + footer; inline contact form (#231) | ✅ 2026-11-11 |
| 10.4 | Generated `/projects/<slug>/` pages replace the modal; View Transitions                                       | ✅ 2026-11-11 |
| 10.5 | Post pages, 404, palette and keyboard help on `<dialog>`; OG card restyle                                     | ✅ 2026-11-11 |
| 10.6 | Slim JS and CSS, performance budgets, docs, cut over to `main`                                                | ✅ 2026-11-11 |

### Phase 11 — Agent readiness

Make the site readable and queryable by AI agents and tighten the Cloudflare setup. One PR per
item from `main`. Decisions (2026-11-11): AI training crawlers allowed; a read-only portfolio MCP
server on the Worker and WebMCP in-page tools; no AI "ask" feature; zone settings applied by a
checked-in script.

| #    | Item                                                                              | Status                                                 |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 11.0 | Zone settings as code (`scripts/cloudflare-zone.mjs`, `pnpm zone`) — #264         | ✅ 2026-11-12                                          |
| 11.1 | Crawl policy, `robots.txt`, generated `llms.txt`, cleaner Markdown — #262         | ✅ 2026-11-12                                          |
| 11.2 | Worker on `andernet.dev/api/*`, so the page calls it same-origin — #267           | ✅ 2026-11-12                                          |
| 11.3 | Discovery documents and the read-only MCP server (`/mcp`, `/.well-known/`) — #270 | ✅ 2026-11-12                                          |
| 11.4 | Zone rules: `Link` headers, HSTS, security headers, report-only CSP — #272        | ✅ 2026-11-12                                          |
| 11.5 | WebMCP in-page tools — #274                                                       | ✅ 2026-11-12                                          |
| 11.6 | Scanner report in CI (`check:agent-ready`), document; compare crawler data        | ✅ 2026-11-12 (the crawler comparison is an open item) |

### Phase 12 — Edge observability

Make the site report on itself, and show it. One PR per item from `main`. Decisions (2026-11-12): build
the public `/status/` page, a footer "edge receipt" and a live "N here now"; publish performance,
reliability and agent activity only (no human visit counts over time, no geography); stay on GitHub
Pages as the origin.

| #    | Item                                                                                                                                | Status                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 12.0 | Access and baseline: a token that can read analytics, cache rules and tracing                                                       | ✅ 2026-11-12                                         |
| 12.1 | Worker telemetry: traces, Issues, source maps, `portfolio_metrics`, `Server-Timing` — #277                                          | ✅ 2026-11-12                                         |
| 12.2 | Footer edge receipt, `GET /api/edge` — #278                                                                                         | ✅ 2026-11-12                                         |
| 12.3 | HTML cached at the edge for an hour, purged by hostname on every deploy — #279                                                      | ✅ 2026-11-12                                         |
| 12.4 | `/api/stats`, the uptime probe and `get_site_stats` (#280); the public `/status/` page (#282)                                       | ✅ 2026-11-13                                         |
| 12.5 | "N here now" on a hibernating Durable Object — #283                                                                                 | ✅ 2026-11-13                                         |
| 12.6 | Report-only CSP reports (#284), switched on and counted on `/status/` (#285)                                                        | ✅ 2026-11-13                                         |
| 12.7 | Alerts: the silent-probe gate (`pnpm check:probe`, daily); the Monitors, a Health Check and an Issues automation are dashboard-only | ✅ 2026-11-13 (the dashboard alerts are an open item) |

### Phase 13 — Claude (candidates)

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

### Phase 14 — Faster, live, first-party

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

## Decision log, 2026-06 to 2026-11-15

Oldest first.

- **2026-06-13** — Static-first: prefer extending `update-github-data.yml` over a Worker
  where possible (contribution graph, skills, activity feed). Workers reserved for
  realtime/dynamic needs (live widget, OG images, view counts, guestbook).
- **2026-06-13** — Do not invent skill proficiency percentages; derive from real repo
  language bytes only.
- **2026-06-13** — Cloudflare Worker confirmed in scope (user deploys via Wrangler). KV
  for counts/guestbook, Turnstile for spam. `worker/` excluded from Pages sparse-checkout.
- **2026-06-13** — Started Phase 1: ROADMAP created; contribution heatmap and language
  bytes both sourced through the existing daily data workflow (no backend).
- **2026-06-13** — Heatmap renders client-side from a pre-fetched GraphQL contribution
  calendar in `github-data.json`; falls back to the `ghchart.rshah.org` image until the
  daily workflow first populates the new fields. Language bars now use real aggregated
  byte counts (forks/archived excluded), falling back to repo-primary-language counts.
- **2026-06-13** — Perf: added `modulepreload` for `ui/projects/github-api`; canvas DPR
  already capped at 2x in `hero-canvas.js`. Deferred `content-visibility` on below-fold
  sections to avoid regressions with the scroll-animation observers (revisit with visual
  verification). Bumped service worker cache to v1.3.0.
- **2026-06-13** — Phase 2.2 done: `worker/index.js` (Cloudflare Worker) + `wrangler.toml`
  created. Worker fetches GitHub public events, picks the most interesting non-portfolio
  event (push/PR/create/release/star), caches 5 min at CF edge, returns JSON. CORS
  restricted to `https://and3rn3t.github.io` + localhost. New `modules/currently.js`
  fetches the Worker (4 s timeout), falls back to pre-fetched events in
  `github-data.json`. Renders a pulsing-dot pill in `#currently-coding` inside the about
  section. Verified in-browser (static fallback): "Currently pushing to health",
  branch `fix/e2e-failures`. **Deploy step**: `wrangler secret put GH_TOKEN` then
  `npm run deploy:worker` (also update `WORKER_URL` in `modules/currently.js` with
  the actual subdomain once deployed). renders an accessible,
  deep-linkable (`#project/<slug>`) case-study modal (focus trap, Esc/backdrop close,
  focus restore). Content is built only from real metadata + live GitHub stats (no
  fabrication). Replaced the per-card inline `<details>` write-up with a "Read case study"
  button. Verified in-browser: open/close, hash sync, dialog role + accessible name, all
  sections render. Modal is built dynamically (no index.html markup needed).

- **2026-06-28** — WASM evaluation (Phase 6). The ask was "rewrite the app in WASM."
  Finding: ~7,600 lines here are DOM/fetch/theming/event glue that JS already does well —
  a literal full rewrite would re-implement browser plumbing for no user-visible gain.
  **Recommendation: hybrid, not a literal full rewrite.** Keep the JS host shell; move the
  genuinely compute/visual-heavy work into a small WASM core. Built and measured a vertical
  slice: an AssemblyScript particle flow-field (`assembly/hero-sim.ts`) whose physics run
  entirely in WASM linear memory while JS only paints the shared buffer. Results (Chrome,
  DPR 2): 6,203-byte wasm (3.3 KB gzip), ~0.2 ms init, ~1.4 ms/step at 5k particles, live
  at 3,486 particles @ locked 120 fps — visibly out-classing the static GLSL gradient.
  Toolchain: AssemblyScript chosen over Rust/wasm-pack because no system Rust is present
  and AS installs as a devDependency with zero machine-level changes; the wasm is loaded
  via `new URL(..., import.meta.url)` + manual `WebAssembly.instantiate` (no top-level
  await, so the es2020 build target is untouched). Guardrails honored: lazy-loaded,
  capability-gateable, with the existing CSS fallback intact; lint + 43 unit tests + Vite
  build all green. Next: 6.4 wire the WASM hero behind the capability gate as an opt-in
  mode; 6.5 port OG images to a Rust WASM rasterizer (deferred — needs the Rust toolchain
  and Worker deploy access to validate).
- **2026-10-04** — Catch-up refresh after a ~2.5-month gap. Escaped all project-modal output
  and added a shared `safeUrl()` (#97). Upgraded to Vitest 5 + jsdom 30, splitting tests into
  `unit` (jsdom) and `worker` (node) projects because `environmentMatchGlobs` is gone (#98).
  Closed 1.4 by measuring `content-visibility: auto` on the below-fold sections against raw
  source: about 13 ms less layout and style work on load, but 2 of the 8 `.animate-on-scroll`
  sections never got `animate-in`, so they stayed hidden on mobile. Not worth it; rejected.
  **The Worker is not live:** `and3rn3t-portfolio.andernet.workers.dev` returns Cloudflare
  error 1042 on every route, and `wrangler.toml` still has `REPLACE_WITH_*` KV IDs. So 2.2
  (currently coding), 2.3 (dynamic OG), 4.1 (view counts) and 4.2 (guestbook) are built and
  tested but not deployed. The site shows static fallbacks, and the browser logs CORS errors
  for `/activity`, `/views` and `/guestbook`. Needs: KV namespaces, a Turnstile site (public
  site key into `TURNSTILE_SITEKEY` in `modules/guestbook.js`, which is still a `REPLACE_WITH_*`
  placeholder), the `GH_TOKEN`/`TURNSTILE_SECRET` secrets, and `wrangler deploy`.
- **2026-10-04** — Worker deployed. The `and3rn3t-portfolio-views` and `-guestbook` KV
  namespaces are created and their IDs are in `wrangler.toml`; `TURNSTILE_SECRET` and
  `GH_TOKEN` are set; the Turnstile site key is in `modules/guestbook.js`. On andernet.dev,
  `/activity`, `/views` and `/guestbook` return 200 with CORS for andernet.dev, so 2.2, 2.3,
  4.1 and 4.2 are now actually live.
- **2026-10-04** — Streamline pass, phase 1 (dead weight): testimonials dropped (3.3) and their
  module, data and CSS removed; the unused Chart.js CDN script and the inline perf snippet
  removed (it prefetched two unauthenticated GitHub API calls per visit and reported to a
  `gtag` that never loads); the hand-written skills proficiency matrix removed, per the
  2026-06-13 rule against invented proficiency; stale marketing docs removed from `docs/`.
- **2026-10-04** — Streamline pass, phase 2 (sections): Skills and GitHub Statistics merged into
  About as a tech strip and a compact dark GitHub panel (4 stats + heatmap). The languages
  block (it repeated the tech strip) and the activity feed (it repeated the currently-coding
  widget) were removed from the client. The workflow still writes `languageBytes` and the Worker
  keeps `/activity` for `currently.js`. Projects now comes before Experience, and nav drops "Home".
- **2026-10-04** — Streamline pass, phase 3 (projects): six projects carry `featured: true` in
  `projects-data.json` (health, homehub, guess, and3rn3t, minecraft, weather-app) and render
  first. The rest of the list, still curated by starring repos, sits behind a "Show N more"
  expander. Featured entries are pinned even when not starred, and the new `and3rn3t` entry is
  the portfolio itself. Curated `technologies`/`homepage` now take precedence over repo
  topics/homepage on cards.
- **2026-10-04** — Streamline pass, phase 4 (contact + theme): the guestbook moved into a
  "Sign the guestbook" tab inside Contact (ARIA tabs, `modules/contact-tabs.js`). The guestbook
  module and Turnstile now load only when that tab first opens, and old `#guestbook` links open
  it. The two-option theme picker became a single light/dark toggle that follows the system
  until the visitor picks a theme. This also fixes the Cmd-K "Toggle theme" action, which threw
  because `ThemeManager.toggle()` was shadowed by the button property.
- **2026-10-06** — Streamline pass, phase 5 (copy): About no longer repeats the hero, section
  intros were trimmed, and the "How This Site Works" post (and `feed.xml`) no longer claims the
  removed skill levels. The intermittent axe failure was traced to labelled `<div>`s without a
  role: `#blog-posts` is empty until the posts load, and axe flags `aria-prohibited-attr` on it.
  Those containers now have roles, and project cards skip their fade under reduced motion.
- **2026-10-09** — UX pass (Phase 8), from a code audit plus a Playwright probe of the live
  site. Wins came from under the surface: the service worker served JS/CSS/JSON cache-first
  with a hand-bumped version (returning visitors saw stale code), `#post/…` and `#project/…`
  deep links threw in `navigation.js`, 490 KB of fonts loaded for 40 icons, and ~2,350 lines of
  analytics/performance/mobile code did nothing visible. Decisions: posts become real pages
  at `posts/<slug>/index.html` (works on GitHub Pages, python http.server and Vite alike),
  generated and committed, with CI failing if `pnpm generate:site` leaves a diff; Cloudflare
  Web Analytics stays as the only analytics. The audit wrongly called `.stat-card` dead (the
  About stats grid renders it) and missed that spacing tokens shrink on mobile
  (`--space-10` is 32px there), so fixed-size controls use rem. Post pages reuse the default OG
  card; per-post cards would need the Rust rasterizer work (6.5).
- **2026-10-09** — Cleanup pass (Phase 9), from three audits (JS, CSS/HTML, tooling) whose claims
  were checked against the code and the live site before acting. The headline find was in
  production: `pages.yml` used unanchored sparse-checkout globs, so `favicon.svg` and
  `og/default.png` 404'd (no share image anywhere) while `package.json`, `tests/` and `worker/`
  were public. Now an anchored allowlist with a guard step, and `pnpm check:refs` fails CI when a
  referenced file is missing or unpublished; it replaces `vite build` in `validate` because the
  bundle never shipped. JS: 404s and rate limits were retried up to 9 times (error text never
  matched the check), and the error handler's fallbacks swallowed init errors; fixed, the module
  went from 282 lines to 38. About 700 lines of dead JS, `wasm-lab.html` and `styles.css`'s
  6,799 to 5,174 lines (dead rules, 17 merged media blocks) removed with a 30-screenshot pixel
  diff against `main`. Two follow-ups are separate PRs so they can be reviewed on their own:
  Stylelint enforcement of the design tokens (#140), and the data workflow (#141: a slimmer
  `github-data.json`, dropping the unused metrics SVG job, OG renders only when their inputs
  change). Left for a human: 22 `@media (max-width: 768px)` blocks that
  can't be merged without choosing which conflicting rule is intended. Also not done: per-post OG
  cards (6.5) and project screenshots in cards.
- **2026-11-11** — Removed the unused OG pipeline (#228). The Worker `/og` route and the 16
  per-project `og/<repo>.png` cards had no consumer: only `og/default.png` is referenced, and the
  case-study modal's client-side `og:image` swap does nothing because scrapers (Slack, iMessage,
  X, LinkedIn, Facebook) do not run JavaScript. The portfolio card renderer moved to
  `scripts/og-card.mjs`; `pnpm generate:og` renders just `og/default.png`. Per-project share
  cards would need real, crawlable `/projects/<slug>/` pages first (like the blog posts), so 6.5
  (a Rust WASM rasterizer for `/og`) is dropped with the route.
- **2026-11-11** — Phase 10.1: the home page's curated content (project cards, experience,
  education, writing) is pre-rendered into `index.html` by `scripts/generate-site.mjs` (formerly
  `generate-posts.mjs`), so it no longer waits on JavaScript or shows spinners. Only stable facts
  are baked in; stars, last push and the "Active" badge are slots filled by `modules/projects.js`,
  because `pages.yml` hashes `*.html` into the service worker's cache id and a page that changed
  daily would evict every visitor's cache daily. Project order is now curated (`featured: <rank>`
  in `projects-data.json`) instead of "last pushed", for the same reason. The scroll-reveal
  `.animate-on-scroll` gate (sections started at `opacity: 0` until a script ran) is gone;
  desktop keeps the CSS `animation-timeline: view()` reveal, phones get none beyond the card
  entrance. The daily data workflow re-runs the generator, because a newly starred repo changes
  the list.
- **2026-11-11** — Phase 10.2 (on the `redesign` branch): design-system core and the checkpoint spike. New
  `styles/core.css` (layers, `light-dark()` tokens, nav, primitives) and `styles/home.css` (intro, lead card);
  the old `styles.css` is `@import`ed into a low `legacy` layer so it keeps rendering unchanged (verified by
  pixel-diffing 36 legacy surfaces before and after). Three traps worth knowing: (1) cascade layers are ordered
  by first appearance, so the inline critical CSS's `@layer legacy` had silently fixed the order and put the
  shared spacing scale above legacy's mobile override; the order is now declared first in `<head>`. (2)
  `backdrop-filter` on a bar makes it the containing block of a `position: fixed` child, which shrank the
  mobile menu sheet; the blur lives on a pseudo-element. (3) A web-font swap re-centred the hero (CLS 0.010); the
  hero is now top-aligned and text uses metric-matched fallback fonts (CLS 0.0004 on desktop, 0 on mobile).
  Removed: the typewriter (`hero-text.js`), the WebGL hero fallback and `supportsWebGL` (also closes #230's
  eager WebGL context), parallax, the scroll-progress bar markup. Screenshots: health is captured from its
  populated `/gait-analysis` page (its home shows "Offline"); homehub is behind Cloudflare Access so it gets a
  generated cover later; the portfolio's own screenshot is deferred until after cut-over so it doesn't capture
  the old design. The per-theme axe scan also exposed two pre-existing dark-theme contrast bugs in the old
  project buttons (2.2:1 and 3.9:1), patched in `home.css` until those elements are replaced. Generated SVG
  covers (`scripts/generate-covers.mjs`) move to 10.3, where the other cards are redesigned.
- **2026-11-11** — Phase 10.3a (Selected work, on `redesign`): the section is now a left-aligned heading, the lead
  card, a flex grid of the other featured projects (three over two, no empty cells) and an always-visible
  compact list for the rest. This replaces the "Show more" expander and the mobile carousel, so `data-extra`,
  the live star/push slots and the "Active" badge are gone and `modules/projects.js` only registers case studies
  (cards no longer show stars, as planned). Featured projects without a screenshot get a generated cover
  (`scripts/templates/cover.mjs`: seeded flow lines, one SVG per theme, written by `generate-site`). Found while
  building it: the same specificity trap as the lead card, this time on cover `<img>`s (a `display: block` on
  `.work-card__media img` out-ranked `.shot--dark` and un-hid the other theme's image, which was still
  downloaded); a new test asserts a theme never requests the other theme's images. Also: the `featured` GitHub
  topic was leaking into project tags, and a nav test needed to poll because colour transitions settle a frame
  late. The legacy dark-theme button patch is deleted along with the buttons it patched.
- **2026-11-11** — Phase 10.3b (About, Experience, Writing, on `redesign`): About is a statement on the left and
  an at-a-glance panel on the right (role, company, since: generated from the current role in
  `experience-data.json`, so it can't go stale; tools as tags). The GitHub strip became a band with two honest
  numbers (contributions in the last year; repositories active in the last six months, now excluding forks and
  archived repos, which took the count from 52 to 24) and a token-coloured chart. "Total stars" and the
  hard-coded "5+ years on GitHub" are gone (#236), and so is the third-party `ghchart.rshah.org` fallback image.
  Experience is one column: role, company and dates on a row, the summary, and the highlights and technologies
  in a native `<details>` (open for the current role, working without JavaScript). Education is compact rows.
  Writing is rows, not cards. Sections are numbered 01-04 by their real page order. The micro-interactions
  module (count-up, tilt, magnetic) is deleted: its targets no longer exist. Traps: a `display: grid` on the
  band silently overrode the `hidden` attribute (the same bug class as `.intro__status`), which a test for the
  no-data case caught; a missing number must stay a dash, because "0 active repositories" would be a false
  statement; the API client retries with backoff, so "no data" takes a few seconds to show. The phone chart
  caption now says "the last 20 weeks" to match what it shows.
- **2026-11-11** — Phase 10.3c (Contact + footer, on `redesign`): finishes 10.3, so the home page's own markup is
  entirely the new system. Contact is direct ways to reach me (email with a copy button, GitHub, LinkedIn,
  résumé) beside a panel with the message form and the guestbook tab. The form is now a progressive
  enhancement (`modules/contact-form.js`, closes #231): without JS it is a plain POST that redirects to
  `#message-sent`, which CSS `:target` turns into a confirmation; with JS it validates inline, posts with
  `fetch` and `Accept: application/json`, shows the outcome in place, and marks the button busy. The button
  uses `aria-disabled`, not `disabled`, so a keyboard user keeps focus, and a second submit in flight is
  ignored (a test fails with three requests if the guard is removed). A failed send keeps what was typed and
  offers the email address. `_next` is the production URL (Formspree needs an absolute one), so a no-JS submit
  from a preview redirects to production; that is accepted. The footer replaces the floating back-to-top
  button and the top loading bar (deleted) with a "Back to top" link, view count, source and RSS links; its
  line says "Plain HTML, CSS and JavaScript, and a Cloudflare Worker" because the old "Vite" was dev-only.
  The guestbook's JS-rendered classes moved to the new names, and its Turnstile theme now reads
  `<html data-theme>`. New `--danger` token (6:1+ in both themes). The per-theme axe scans now also cover the
  form with its errors showing, and the submit button's hover. **Still on legacy CSS (the 10.4-10.6 list):**
  the project case-study modal and its `.project-link` buttons (10.4, replaced by project pages), the command
  palette, keyboard help and toasts (10.5), and the `.skip-link` and `.sr-only` utilities, which must be
  ported into `core.css` before `styles.css` is deleted in 10.6. Playwright note: `locator.click()` waits out
  an `aria-disabled` element, so tests that click a busy button use `force: true`.
- **2026-11-11** — Phase 10.4 (project pages, on `redesign`): every curated project with a write-up now has a
  generated page at `/projects/<slug>/` (17 of them), and the case-study modal is gone
  (`modules/project-modal.js`, `modules/projects.js`, `modules/blog.js` and the modal CSS and tests deleted).
  Cards link to the page in the same tab; without JS they are plain links. A page has a breadcrumb, header
  with Live demo and Source buttons, the screenshot (or the generated cover), overview, highlights, curated
  metrics only when the data has them, a facts and stack aside, and a previous/next pager; JSON-LD is
  `SoftwareSourceCode` plus `BreadcrumbList`, and `og:image` is the project's own crop when one exists, else
  `og/default.png`. Slugs are lowercased (`HealthKitBridge` is `/projects/healthkitbridge/`), and a unit test
  checks the slug is the same with and without the repo. Old `#project/<slug>` links redirect
  (`modules/legacy-links.js`, which replaces `blog.js`). The pages load only `core.css` + `article.css`: 13
  requests and about 150-175 KB, CLS 0 (the home page is still 41 requests and 650 KB until 10.6). To make that
  possible `core.css` gained the `.icon`, `.sr-only` and `.skip-link` primitives, the footer, `.facts` and
  `.shot` picture rules, and a minimal reset (box-sizing, `body` margin); the legacy `@import` moved from
  `core.css` to `home.css`. **View transitions:** the card's image and title morph into the page's
  (`modules/page-transitions.js` names them only during a navigation, in `pageswap`/`pagereveal`, so a theme
  switch is unaffected; reduced motion turns it all off). **The `@view-transition` opt-in must be an inline
  `<style>` in every page's `<head>`, not in `core.css`:** with the rule in the external stylesheet Chrome
  aborted 8 of 15 card-to-page navigations with "opt-in disabled" (an unhandled rejection that fails
  `pageerror` tests); inline it was 0 of 15. `VIEW_TRANSITION_CSS` in `scripts/templates/chrome.mjs` is the
  single source, `index.html` carries a copy, post pages get it from the generator, and a unit test keeps them
  identical. Both pages of a navigation must opt in, so post pages (still on `styles.css`) carry it until 10.5.
  **Not verified:** the morph itself (only that no transition errors; I have not watched it in a headed
  browser), iOS Safari (no cross-document view transitions, so it cross-fades nothing and just navigates), and
  the real share cards in a social debugger. **Known flake, not from this phase:** `palette.spec.js` "'/' key
  opens the palette" fails about 1 in 15 under parallel load without `CI=1` (also on the pre-phase commit).
- **2026-11-11** — Phase 10.5a (post pages, 404, offline, on `redesign`): the three remaining pages that were not on
  the new system. Post pages (`scripts/templates/post-page.mjs`) use the same head, nav, footer and pager as the
  project pages, with a `.prose` block in `styles/article.css` for the post's own HTML (headings, links, inline
  and block code, lists, quotes, images, tables; a code block or table scrolls inside the reading width), a
  BreadcrumbList beside the BlogPosting data, and a CSS-only reading-progress bar (`animation-timeline: scroll()`,
  no script; browsers without it just have no bar). `404.html` is now generated (`not-found.mjs`) from the same
  parts, `noindex`, with no canonical, and every URL absolute because GitHub Pages serves it at whatever address
  was missing; a test serves it at a deep address. `offline.html` stays hand-written and self-contained (the
  service worker shows it when nothing else is available) with the design tokens copied in, and a test fails if
  those values drift from `core.css`. Its old claims ("GitHub statistics", "contact information") are replaced
  by what the precache really holds, and it now reloads only when the browser reports the connection coming
  back: the old five-second poll looped forever whenever the browser said it was online but the site was not
  reachable. About 6 KB of legacy CSS (`.blog-*`, `.post-nav`, `.post-pager`, the old `.skip-link`) is deleted;
  a pixel diff of every home section, in both themes at 1440 and 390, is identical before and after. The post
  pages lose their inline view-transition block (the shared head carries it). **The post "How This Site Works"
  still describes the old stack (one `styles.css`, dark mode as a class on `body`, the modal); it is Matt's
  copy to update.** Still to do in 10.5: the palette, keyboard help and toasts on `<dialog>` (10.5b), and the
  OG card and `manifest.json` colours (10.5c).
- **2026-11-11** — Phase 10.5b (dialogs and toasts, stacked on 10.5a): the command palette and keyboard help are native
  `<dialog>`s opened with `showModal()`. The browser now supplies what two hand-written traps did badly: focus
  containment, Esc, an inert page behind, and focus restore (the old traps had already shipped two bugs: an icon
  counted as the last focusable element, and `.at()` on a `NodeList`). About 130 lines of trap and visibility
  code are deleted from `command-palette.js` and `keyboard-help.js`. **Behaviour change:** Tab past the last
  control hands focus to the browser's own UI instead of wrapping to the first, which is how every native modal
  dialog works; the tests now assert that focus never reaches the page behind (and that the page is inert)
  rather than that it wraps. The page also no longer scrolls behind an open dialog (`:root:has(dialog[open])`).
  `?` and `g` are ignored while the palette is open, so help cannot open on top of it. The palette now indexes the
  posts (read from the Writing rows, so there is no second source), and the empty state's `<h3>` and the help
  title's emoji are gone (a dialog needs no heading level of the page's, and an emoji in a heading is read out).
  The two toasts (the page's and the palette's) are one `.toast` style on the tokens, bottom-centre, inverted
  in both themes with `--accent` and `--danger` variants whose contrast is measured in a test per theme. The
  toast is deliberately _not_ a popover: a hidden popover is `display: none`, and a live region that appears
  with its text already in it is not announced. A new `--shadow-overlay` token replaces the legacy shadows.
  Deleted from `styles.css`: 95 rules and about 13 KB (the palette, keyboard help and both toasts); a pixel
  diff of every home section in both themes at 1440 and 390 is identical. **Not verified:** the open/close
  animation (`@starting-style`, `allow-discrete`) in a headed browser or Safari (browsers without it just
  appear and disappear), and `::backdrop` picking up `--scrim` in older Safari (an unset custom property there
  means no tint, though the dialog is still modal). Still to do in 10.5: the OG card and `manifest.json` colours
  (10.5c).
- **2026-11-11** — Phase 10.5c (share card and colours; finishes 10.5): `scripts/og-card.mjs` draws the card in the
  site's dark tokens (surface, text, muted, border) with green as the one accent (a short rule and the handle),
  Inter for the name and numbers and JetBrains Mono for labels, a rule across the full width and the language
  panel aligned to the stats. The old card had green numerals, a green edge, and secondary text at
  `#4b5563`/`#6b7280`, which is dim; the new one uses the muted token throughout. The language colours stay
  GitHub's (they are data). `generate-og.mjs` embeds the mono font, and the daily workflow's input hash now
  covers it, so a font change regenerates the card. **The committed `og/default.png` is not changed here** (CI
  renders the committed card, and a local render differs by anti-aliasing): the next daily data run sees the
  changed inputs and regenerates it. Run the workflow by hand to get it sooner. The browser-bar colour
  (`theme-color`) was `#ffffff`/`#0a0a0a` against surfaces of `#fbfbf8`/`#0b0d0b`, so the bar did not match the
  page; it now matches in `index.html`, the generated pages, `offline.html` and the theme switch in `theme.js`.
  `manifest.json` `background_color` and `theme_color` move from white and the old green to the light surface.
  A manifest has one theme colour, so an installed app opened in the OS dark mode still starts on the light
  surface for a moment. `brand-colours.test.js` reads `core.css` and fails if any of these copies drifts.
  **Not changed:** the app icons (`icons/icon-*.png|svg`) still use the old green; redrawing them is a design
  task, not a refactor. **10.5 is done; next is 10.6** (slim JS and CSS, performance budgets, delete `styles.css`,
  docs, cut over to `main`).
- **2026-11-11** — Phase 10.6a (start sooner, load less up front; stacked on 10.5c). Measured first, on the home
  page at 1440 and 390: **41 requests, 646 KB, 24 script files and 111 KB fetched before the app was ready**, and
  `styles.css` is 94 KB of which about 11% matches anything on the home page (after opening the palette and help
  and scrolling everything). No module is dead (every file is imported), so this is deferral, not deletion.
  `main.js` awaited its optional modules one after another and registered the service worker last (#225); it
  now runs a short critical path (service worker and global handlers first, then the theme, menu, navigation and
  UI shell), fires `app:ready`, and starts every other feature on its own: the About stats when that band is near
  (or after 4 s), the contact tabs and form when Contact is near (until then the form is a plain POST, which
  works), the hero flow field, palette and keyboard help at idle, the Worker widgets at idle, and the old-link
  redirect only when the address has a `#post/` or `#project/` hash. **Result: app ready at about 29 ms instead of
  69; 9 script files and 49 KB fetched by then (was 24 and 111 KB); 21 requests and 362 KB by then (was 41 and
  582 KB).** After everything has settled the totals are unchanged (42 requests, 25 files), because nothing was
  removed: the saving is what a first visit has to wait for. A key pressed before the palette or help has loaded
  still works: a small shim in `main.js` loads the module on demand and then opens it (Ctrl/Cmd+K, `/`, `?`, and
  the nav search button), and steps aside once the module's own handlers exist. The dead scroll-progress code in
  `initNavigation` is removed. `budgets.spec.js` fails if more than 12 script files or 70 KB are needed to be
  ready, if an optional feature is fetched before ready, if the settled page exceeds 28 files, 130 KB or a
  layout shift of 0.01, or if a shortcut used before its module loads stops working (mutation-checked: disabling
  the shim fails three tests). **Still to do in 10.6:** retire `styles.css` (94 KB, the largest remaining cost),
  then docs and the cut-over to `main`.
- **2026-11-11** — Review follow-ups on 10.6a (three Copilot comments, all valid). **`whenNear`** used
  `requestIdleCallback`'s `timeout` as its fallback, but that is a deadline: the contact form and About stats
  started at the first idle moment whatever the page showed. It is a real timer now, and a test fails if the form's
  script loads while Contact is far away. **`g` then h/a/p/c** lived in the deferred keyboard-help module, so a
  `g c` pressed while it downloaded lost both keys (or the prefix, if the module landed between them). It needs
  nothing from the module, so it moved to `main.js` (`installGlobalShortcuts`) and works from the first moment; the
  1.2 s prefix window is tested, including a module arriving between the two keys. **`?` over the palette:** a `?`
  pressed while help loaded could open it on top of the palette; the shim now checks for an open dialog before
  requesting help and again when it arrives (a mutation without the second check fails a test).
- **2026-11-11** — Phase 10.6b (retire `styles.css`; stacked on 10.6a): the 94 KB legacy stylesheet is deleted, and
  with it the `legacy` cascade layer, the inline "legacy critical CSS" block in `index.html`, the
  `<link rel="preload">`, the body `dark-theme` script, `body.dark-theme` in `theme.js`, and the service-worker,
  Pages and ref-check entries. Method: **delete, then diff.** I removed the import and compared 54 screenshots
  (sections, full page and the interactive states: mobile menu, palette, help, toast, form errors, guestbook; both
  themes at 1440 and 390), then used CSS coverage on the old tree to list which legacy rules the home page really
  used: **50 of 568**. What the page still needed moved into `home.css` in explicit layers: the
  margin-and-padding reset, the body's type, `scroll-behavior`, coarse-pointer tap targets, the phone-sized
  scale (still pinned by a test), and the "currently" widget, which now owns its own structure instead of
  patching the old rules. **Differences that remain are legacy rules leaking into new components, and each now
  follows the design system:** dark-mode paragraphs use the `--text` token (they were a dimmer grey from
  `body.dark-theme p`); the footer uses `--muted`; phone screenshots render smoothly (legacy forced
  `image-rendering: crisp-edges`, which is jagged when downscaled); an empty form or guestbook status no longer
  carries 20 px of padding and a border, so Contact is 24-44 px shorter; and a mouse click no longer draws a
  3 px focus ring (`:focus-visible` only). `check-refs` now also validates the `url()`s in every file in
  `styles/` (the font paths in `core.css` were unchecked). **Result at app-ready on the home page: 14 requests and
  184 KB (was 21 / 362 KB after 10.6a, 41 / 582 KB originally); settled 41 requests and 495 KB (was 587 KB).**
  **The "known flake" is fixed, and it was never a flake in the product.** `page.locator('body').click()` clicks the
  centre of the whole document, which on a page this long can land inside the contact form's textarea; the `/`
  or `?` key is then correctly typed into the field and the test fails. It showed up as roughly 1 run in 15
  under load (and in my new early-shortcut test, which exposed it at 2 to 4 in 40). Eleven tests now blur the
  focused element instead (`document.activeElement?.blur()`); the old flaky test passes 60 of 60 and the new one
  40 of 40 under 8 workers. **Still to do in 10.6:** the cut-over (docs pass, removing `redesign` from the CI
  branch list, the final `redesign` to `main` PR, a Lighthouse mobile run).
- **2026-11-11** — Review follow-ups on 10.6b (two Copilot comments, both valid, both my misses). **The Konami-code
  terminal** (`modules/easter-egg.js`) lost all its styling with `styles.css`: it only exists after the code is
  entered, so my coverage run never rendered it and nothing tested it (an unstyled block appeared under the
  footer). Its styles are now in `home.css` on tokens, with `color-scheme: dark` on the panel so it stays a dark
  terminal on a light page without writing a colour, and it has its first test (overlay geometry, dark panel and
  green text in both themes, Esc and backdrop close, axe, phone fit; 7 of 11 fail without the styles). **Safe-area
  padding:** legacy padded `body` by the left and right safe-area insets, and the pages use `viewport-fit=cover`, so
  on a notched phone held sideways content ran under the cutout. It was in my coverage list and I skimmed past it.
  It is now in `core.css`, so the generated pages (which never had it) get it too, and Chromium's inset emulation
  tests it on the home, project, post and 404 pages (4 of 4 fail without it). **Lesson recorded:** coverage only sees
  what a run renders. After deleting a stylesheet, also list every class JS creates and every class in the markup
  and check each still has a rule in the new CSS; I did that sweep after this review and the terminal was the
  only gap.
- **2026-11-11** — Phase 10.6c (the cut-over, `redesign` to `main`). **Checked before opening the PR:**
  _Returning visitors._ A visitor's old service worker serves JS and CSS stale-while-revalidate, so on the first
  visit after deploy they get the new HTML with their cached old `main.js`. I simulated it: installed the old
  site's worker (`main`, stamped build id), swapped the server to the new build on the same origin, and reloaded.
  First visit: the new CSS and shell render, no errors, cards not duplicated, a project-card click reaches its
  page (the old code runs one last time and is harmless). Second visit: fully clean, because the background
  revalidation refreshed the cache. The new worker then installs and deletes the old caches (only `newbuild`
  remained). One simulation artifact worth knowing: Python's static server answers `If-Modified-Since` at
  one-second granularity, so two `sw.js` files stamped within the same second looked "unchanged"; GitHub Pages
  uses ETags and does not have that problem. _Lighthouse_, run locally against the build served with gzip and
  `max-age=600` like Pages (an uncompressed server scored mobile 86, which was the server and not the site):
  **mobile 99 / 100 / 96 / 100 (performance, accessibility, best practices, SEO) in four runs, LCP 1.8 s, FCP 1.1 s,
  TBT 0, CLS 0; desktop 100 / 100 / 96 / 100, LCP 0.4 s.** The 96 is only the Cloudflare analytics beacon being
  blocked by CORS from `127.0.0.1`, which cannot happen in production. Lighthouse also found two real
  accessibility issues the axe scans had missed, both fixed and now tested: the contribution chart was
  `<figure role="img">` (not an allowed role; it also hid the caption), and the desktop search button's visible
  text included its `<kbd>` hint, which its accessible name did not contain (WCAG 2.5.3); the hint is now
  generated content from `data-shortcut`. The chart is drawn after load, so the axe scans ran before it existed;
  new scans wait for it. **Changed:** Lighthouse CI now audits mobile as well as desktop
  (`.lighthouserc.mobile.cjs`, a second job in `lighthouse.yml` and `pages.yml`), performance is an `error` at
  0.9 (was `warn` at 0.8), accessibility an `error` at 0.95, layout shift an `error` over 0.1, and
  `aria-allowed-role` is an `error`; both configs were validated with `lhci collect` and `assert` against the
  build, and the threshold fires on a slow server. `redesign` is removed from `quality.yml`'s PR branches.
  **Budgets ratcheted:** by `app:ready`, 10 script files and 60 KB (was 12 and 70; it is 9 and 48). **Where the
  plan was not met:** the home page's CSS is 66.5 KB raw (13.5 KB gzipped), down from 113 KB, but the plan said
  under 50 KB raw; `css-budget.test.js` pins it at 72 KB so it can only go down. **Phase 10 outcome:** home
  page at app-ready 14 requests and 184 KB (was 41 and 582 KB); no spinners for curated content; readable
  without JS; CLS 0; one stylesheet pair per page type; the case-study modal, three hand-rolled focus traps and
  the 94 KB legacy stylesheet are gone. **Not done, and for Matt:** the post "How This Site Works" still
  describes the old stack (his copy); the app icons still use the old green; `og/default.png` regenerates on the
  next daily data run (or run the workflow by hand); homehub's cover is generated because its demo is behind
  Cloudflare Access; and a capture of the new portfolio for its own card needs the site live first.

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

- **2026-11-13** — Phase 13 (Claude candidates) drafted, not started. Findings that shaped it: the live
  `/mcp` has 8 tools and none carries `title` or `readOnlyHint`; claude.ai accepts a No-sign-in remote MCP
  server over Streamable HTTP, but one GitHub issue reports it forcing OAuth, so test it live before
  promising it; the directory needs annotations, narrow tool descriptions and public docs, and test
  credentials do not apply to an authless server; MCP Apps work in Claude, but embedded sites and entry
  points need a Verified listing.

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

- **2026-11-15** — 14.4 narrowed. The views counter moves to its own SQLite Durable Object class (`Counter`,
  not `Presence`: a separate class keeps the sockets' object out of the request path), seeded from KV, with KV
  written every 10th count. The planned "new version is live" message over the presence socket was dropped: the
  object hibernates, and a hibernated object does not run its constructor on a deploy, so the message would only
  go out when someone next connected, which is not "live". It would need the deploy workflow to call the Worker
  with a secret. Not worth it for a toast the service worker already shows. 14.1 and 14.2 were deployed as Worker
  `6f275d34` (rollback `cb9ffa35`); `/activity` and `/stats` went from p95 2.9 s and 4.4 s to about 0.1 s.

- **2026-11-15** — 14.3 to 14.5 shipped. The status panel (`show_status`) renders in Claude Desktop, marked
  Unverified like the project card. Getting there cost a detour worth keeping: 14.3 added the tenth tool without
  bumping `SERVER_VERSION`, and a Desktop session kept listing nine tools after a reconnect; bumping to 1.2.0
  (#327) and starting a new chat fixed it, and a test now pins the version to the tool list. The model in the
  chat cannot see the UI, so what Claude says about a card is not evidence of whether it drew; look at the
  screen. Prerender on hover is live: the rules are hashed into the CSP (the `'inline-speculation-rules'`
  keyword did not satisfy Chromium here) and the zone was applied on 2026-11-15. Playwright cannot watch a
  prerender succeed (Chromium disables it while DevTools is attached), so the e2e checks that the browser accepts
  the rules and tries one on hover.

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
