# Roadmap decision log, archive

Entries from 2026-06 to 2026-10, moved out of [ROADMAP.md](../ROADMAP.md) to keep it short. Newest entries stay in the roadmap.

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
