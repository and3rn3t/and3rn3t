# Portfolio Roadmap

Multi-phase plan for the next round of work on the portfolio. Status is kept current as
items are worked. Worker items deploy via Cloudflare/Wrangler, separate from the GitHub
Pages static deploy.

Status legend: ⬜ not started · 🟡 in progress · ✅ done · ❌ dropped

## Phase 1 — Foundation + quick wins

| #   | Item                                                                                                                                    | Status        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1.1 | Create this ROADMAP.md                                                                                                                  | ✅ 2026-06-13 |
| 1.2 | Real contribution heatmap (extend `update-github-data.yml` → render `#contribution-graph`)                                              | ✅ 2026-06-13 |
| 1.3 | Real language proficiency from repo language bytes (workflow still writes `languageBytes`; on-page bars removed in the streamline pass) | ❌ superseded |
| 1.4 | Perf polish — modulepreload (✅), canvas DPR cap (already done), `content-visibility` (rejected)                                        | ✅ 2026-10-04 |

## Phase 2 — Signature wow features

| #   | Item                                                                                                         | Status        |
| --- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| 2.1 | Case-study deep dives — long-form in `projects-data.json` + accessible modal in `projects.js`, deep-linkable | ✅ 2026-06-13 |
| 2.2 | Live "currently coding" widget (Worker + GitHub events, static fallback)                                     | ✅ 2026-06-13 |
| 2.3 | Dynamic OG images (Worker SVG — portfolio + per-project cards)                                               | ✅ 2026-06-13 |

## Phase 3 — Content & credibility

| #   | Item                                                                                      | Status        |
| --- | ----------------------------------------------------------------------------------------- | ------------- |
| 3.1 | Blog / writing section (posts-data.json, modules/blog.js, in-page article view, feed.xml) | ✅ 2026-06-13 |
| 3.2 | Experience / timeline section (experience-data.json, modules/experience.js)               | ✅ 2026-06-13 |
| 3.3 | Testimonials section (static data)                                                        | ❌ dropped    |
| 3.4 | Resume integration — prominent CTA + schema.org Person JSON-LD                            | ✅ 2026-06-13 |

## Phase 4 — Engagement & data

| #   | Item                                                                                                                             | Status        |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 4.1 | View counts (Worker + KV — POST /views increments, footer widget shows count)                                                    | ✅ 2026-06-13 |
| 4.2 | Guestbook (Worker + KV + Turnstile — /guestbook GET/POST, in-page section)                                                       | ✅ 2026-06-13 |
| 4.3 | Cloudflare Web Analytics beacon live (token already embedded in index.html)                                                      | ✅ 2026-06-13 |
| 4.4 | Real GitHub activity feed (Worker `/activity` kept for the currently-coding widget; feed section removed in the streamline pass) | ❌ superseded |

## Phase 5 — Quality & infra guardrails

| #   | Item                                                                              | Status        |
| --- | --------------------------------------------------------------------------------- | ------------- |
| 5.1 | Lighthouse CI workflow with perf/a11y budgets                                     | ✅ 2026-06-13 |
| 5.2 | Vitest unit tests (github-api cache/retry, capabilities, fuzzy search)            | ✅ 2026-06-13 |
| 5.3 | Playwright e2e for interactive: Cmd-K palette, `?` help, theme picker, Konami egg | ✅ 2026-06-13 |
| 5.4 | axe-core a11y check in CI                                                         | ✅ 2026-06-13 |
| 5.5 | Worker tests (vitest + miniflare) once a Worker exists                            | ✅ 2026-06-13 |

## Phase 6 — WebAssembly (compute core)

Hybrid architecture: a thin JS host shell with a Rust/AssemblyScript→WASM core for the
few genuinely compute/visual-heavy pieces. WASM is always lazy-loaded + capability-gated,
and every feature keeps its existing JS/CSS fallback. See `assembly/`, `modules/wasm/`.

| #   | Item                                                                                                                                                                                                | Status        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 6.1 | WASM toolchain (AssemblyScript) wired into Vite build + lazy load (`asconfig.json`, `build:wasm`)                                                                                                   | ✅ 2026-06-28 |
| 6.2 | Hero particle flow-field compute core in WASM (`assembly/hero-sim.ts` + `modules/wasm/hero-sim.js`)                                                                                                 | ✅ 2026-06-28 |
| 6.3 | `wasm-lab.html` interactive showcase + live FPS/particle HUD (measured: 3.5k particles @ 120fps)                                                                                                    | ✅ 2026-06-28 |
| 6.4 | WASM hero shipped live: `initHeroEnhancements` mounts the flow-field first, falling back to the WebGL shader then CSS (`main.js`); transparent `destination-out` trails composite over the gradient | ✅ 2026-06-28 |
| 6.5 | Edge OG images via a Rust WASM rasterizer (port `worker/og.js` → PNG), SVG kept as fallback                                                                                                         | ⬜            |

## Phase 7 — Streamline

| #   | Item                                                                          | Status        |
| --- | ----------------------------------------------------------------------------- | ------------- |
| 7.1 | Remove dead weight (Chart.js, testimonials, skills matrix, stale docs) — #109 | ✅ 2026-10-04 |
| 7.2 | Merge Skills + GitHub stats into About; Projects before Experience — #110     | ✅ 2026-10-04 |
| 7.3 | Six featured projects + "Show more" expander — #111                           | ✅ 2026-10-04 |
| 7.4 | Fix closed mobile nav menu blocking every tap — #113                          | ✅ 2026-10-06 |
| 7.5 | Guestbook into Contact tabs; single light/dark toggle — #114                  | ✅ 2026-10-06 |
| 7.6 | Copy pass: de-duplicate hero/About/intros; correct "How This Site Works" post | ✅ 2026-10-06 |

## Phase 8 — UX pass

| #   | Item                                                                                                          | Status        |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------- |
| 8.1 | Service worker serves fresh code (SWR/network-first, deploy-stamped cache); deep links no longer throw — #128 | ✅ 2026-10-09 |
| 8.2 | First paint: no opacity gate, Inter subset, Font Awesome → SVG sprite, one data fetch — #130                  | ✅ 2026-10-09 |
| 8.3 | Remove analytics/performance/mobile modules; one scroll owner; scroll-spy fix; `<main>` — #131                | ✅ 2026-10-09 |
| 8.4 | Mobile polish: navbar theme toggle, contact form, card copy, contrast — #132                                  | ✅ 2026-10-09 |
| 8.5 | Static post pages (`/posts/<slug>/`), feed and sitemap generated from `posts-data.json`                       | ✅ 2026-10-09 |
| 8.6 | Project screenshots in cards/case studies; View Transitions for modal and post navigation                     | ⬜            |

## Decision Log

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
  generated and committed, with CI failing if `pnpm generate:posts` leaves a diff; Cloudflare
  Web Analytics stays as the only analytics. The audit wrongly called `.stat-card` dead (the
  About stats grid renders it) and missed that spacing tokens shrink on mobile
  (`--space-10` is 32px there), so fixed-size controls use rem. Post pages reuse the default OG
  card; per-post cards would need the Rust rasterizer work (6.5).
