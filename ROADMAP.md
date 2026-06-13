# Portfolio Roadmap

Multi-phase plan for the next round of work on the portfolio. Status is kept current as
items are worked. Worker items deploy via Cloudflare/Wrangler, separate from the GitHub
Pages static deploy.

Status legend: ⬜ not started · 🟡 in progress · ✅ done

## Phase 1 — Foundation + quick wins

| # | Item | Status |
| --- | --- | --- |
| 1.1 | Create this ROADMAP.md | ✅ 2026-06-13 |
| 1.2 | Real contribution heatmap (extend `update-github-data.yml` → render `#contribution-graph`) | ✅ 2026-06-13 |
| 1.3 | Real language proficiency from repo language bytes → `#main-language-stats` | ✅ 2026-06-13 |
| 1.4 | Perf polish — modulepreload (✅), canvas DPR cap (already done), `content-visibility` (deferred) | 🟡 |

## Phase 2 — Signature wow features

| # | Item | Status |
| --- | --- | --- |
| 2.1 | Case-study deep dives — long-form in `projects-data.json` + accessible modal in `projects.js`, deep-linkable | ⬜ |
| 2.2 | Live "currently coding" widget (Worker + GitHub events, static fallback) | ⬜ |
| 2.3 | Dynamic OG images (Worker + satori per section) | ⬜ |

## Phase 3 — Content & credibility

| # | Item | Status |
| --- | --- | --- |
| 3.1 | Blog / writing section (markdown → HTML, list + article view, RSS, sitemap) | ⬜ |
| 3.2 | Experience / timeline section | ⬜ |
| 3.3 | Testimonials section (static data) | ⬜ |
| 3.4 | Resume integration — promote `resume.pdf`, structured data | ⬜ |

## Phase 4 — Engagement & data

| # | Item | Status |
| --- | --- | --- |
| 4.1 | View counts + reactions (Worker + KV) | ⬜ |
| 4.2 | Guestbook (Worker + KV + Turnstile) | ⬜ |
| 4.3 | Verify Cloudflare Web Analytics live + small public stats widget | ⬜ |
| 4.4 | Real GitHub activity feed from extended `github-data.json` | ⬜ |

## Phase 5 — Quality & infra guardrails

| # | Item | Status |
| --- | --- | --- |
| 5.1 | Lighthouse CI workflow with perf/a11y budgets | ⬜ |
| 5.2 | Vitest unit tests (github-api cache/retry, capabilities, fuzzy search) | ⬜ |
| 5.3 | Playwright e2e for interactive: Cmd-K palette, `?` help, theme picker, Konami egg | ⬜ |
| 5.4 | axe-core a11y check in CI | ⬜ |
| 5.5 | Worker tests (vitest + miniflare) once a Worker exists | ⬜ |

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
