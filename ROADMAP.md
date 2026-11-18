# Portfolio Roadmap

Plan for the next round of work on the portfolio. Status is kept current as items are worked. Worker items deploy
via Cloudflare/Wrangler, separate from the GitHub Pages static deploy.

Status legend: ⬜ not started · 🟡 in progress · ✅ done · ❌ dropped

Phases 1–14 are complete; their tables and decision log are in
[docs/ROADMAP-archive.md](docs/ROADMAP-archive.md). (There was no Phase 9 table: it was a tech-debt cleanup
pass recorded only in the log.) Phase 15 is below, with what is still open across all of them.

## Open items

As of 2026-11-18. Nothing here blocks anything; each is a decision, a look, or work only Matt can do.

| What                                                  | Why it is open                                                                                                                                                                                                                                                                                                                                                                               | Who, and when                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Enforce the CSP, or not                               | Report-only since 2026-11-13, with Trusted Types added 2026-11-17. The one live source of Trusted Types reports is Cloudflare's own `email-decode` script (about four `innerHTML` reports per home visit); enforcing would break its decoded `mailto:` links unless Email Address Obfuscation is turned off in Scrape Shield or a default policy is added                                    | Matt. The follow-up issue opens itself on 2026-11-27 (`scripts/follow-ups.mjs`) |
| Compare AI Crawl Control with the 2026-11-11 baseline | Crawler mix, bot 404s and referrals, after a few weeks of the new `robots.txt` and agent endpoints                                                                                                                                                                                                                                                                                           | Matt, in the dashboard. The follow-up issue opens itself on 2026-12-09          |
| The dashboard-only alerts                             | Three Monitors, a Health Check on the origin and an Issues automation (definitions in `AGENTS.md`); trim the zone API token, which can read DNS                                                                                                                                                                                                                                              | Matt, in the dashboard                                                          |
| Things seen only with fakes, or not yet seen live     | claude.ai listing the prompts and attaching a resource (15.1); a real signed agent, and `signedShare` on `/status/` (15.2, two weeks of data from 2026-11-15); Durable Object cost after a day of `hero-shared` (15.5); the HDR glow on a real HDR screen (15.7); the post tools and a larger run of the ask with the real model (15.13, 15.14: the model is now installed in Matt's Chrome) | Matt looks; the `/lab/` entries say "not yet judged" where that is still true   |
| Promote or drop the lab experiments                   | `/lab/` lists seven (`hero-gpu`, `hero-seed`, `hero-hdr`, `agent-view`, `hero-shared`, `post-tools`, `ask`), each off by default; none is the default for visitors                                                                                                                                                                                                                           | Matt                                                                            |
| 15.4 and 15.8                                         | Not started: the MCP Apps matrix needs Matt's accounts, and sound only makes sense if the hero work landed well                                                                                                                                                                                                                                                                              | Matt, optional                                                                  |
| Audit leftovers                                       | #234 (Stylelint for inline `<style>` blocks, unit tests for the UI modules) and #5 (the Renovate dashboard), as of 2026-11-15                                                                                                                                                                                                                                                                | Whenever                                                                        |

## Phase 15 — Lab

Experimental and cutting-edge work, each experiment off by default behind a flag and listed on `/lab/` with what it
needs and what was measured. One PR per item from `main`. Decisions (2026-11-15): all four tracks (agent frontier,
live and shared, platform-native, on-device AI); the browser's own built-in model is allowed as an opt-in experiment,
no server-side model runs for visitors; platform-native items are refactors with a fallback, not flags. Every row
needed a measure and a drop condition before code, and a support check in real browsers first (several statuses
changed this year and sources disagreed). Nothing deployed or touched the zone without an explicit go.

| #     | Item and result                                                                                                                                                                                                         | Status              |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 15.0  | Lab scaffold: the `lab()` flag helper, `lab-data.json`, a generated `/lab/` page with switches — #342                                                                                                                   | ✅ 2026-11-15       |
| 15.1  | MCP prompts and resources — #347. Live in server 1.3.0. Not yet seen: claude.ai listing the prompts or attaching a resource                                                                                             | ✅ 2026-11-15       |
| 15.2  | Signed agents (Web Bot Auth) counted on `/status/` — #348. The Worker verifies and only counts (Cloudflare documents no field it could read). No real signed agent seen yet                                             | ✅ 2026-11-15       |
| 15.3  | "View as agent" (`agent-view`) — #345                                                                                                                                                                                   | ✅ 2026-11-15       |
| 15.4  | `show_project` and `show_status` in ChatGPT, VS Code and Goose; a matrix in the agent-ready post                                                                                                                        | ⬜ Matt's accounts  |
| 15.5  | Shared flow field (`hero-shared`) — #349. About 50 ms between two pages on the real edge; 25 seats, and one address can fill them (accepted). Cost over a day of use not measured                                       | ✅ 2026-11-15       |
| 15.6  | Hero of the day (`hero-seed`, `?seed=`) — #343                                                                                                                                                                          | ✅ 2026-11-15       |
| 15.7  | HDR for the GPU hero (`hero-hdr`) — #344. Never seen on a real HDR screen                                                                                                                                               | ✅ 2026-11-15       |
| 15.8  | Sound, only if 15.5 or 15.6 landed well                                                                                                                                                                                 | ⬜ optional         |
| 15.9  | The mobile menu as a popover — #352. Menu only: the payload grew about 0.6 KB, so the size measure was missed; kept for behaviour (it works before and without the script). The palette and keyboard help were left out | ✅ 2026-11-17       |
| 15.10 | Trusted Types in the report-only CSP — #354, #355. The header is live (applied 2026-11-17); enforcing is an open decision                                                                                               | ✅ 2026-11-17       |
| 15.11 | CSS in place of script — #356. The home bar's hairline is a scroll timeline and the terminal fades in from `@starting-style`; the other candidates were measured and not worth building                                 | ✅ 2026-11-17       |
| 15.12 | Back/forward cache — #357. The pages were already restored, so it shipped a check (`pnpm check:bfcache`) and a guard                                                                                                    | ✅ 2026-11-17       |
| 15.13 | On-device post tools (`post-tools`) — #353. Real model output not yet checked                                                                                                                                           | ✅ 2026-11-17 (lab) |
| 15.14 | On-device "ask the portfolio" (`ask`) — #358, #359, #360. Measured with the real model                                                                                                                                  | ✅ 2026-11-18 (lab) |

Parked: import-map integrity (an inline import map means a CSP hash per module edit; Safari 26.6 has an open
blank-page bug), anything with a server-side model at visitor time, paid or OAuth agent protocols, ActivityPub or
AT Protocol identity.

## Decision Log

Newest first. Older entries (2026-06 to 2026-11-15, including Phases 1 to 14) are in
[docs/ROADMAP-archive.md](docs/ROADMAP-archive.md).

- **2026-11-18** — Phase 15 (Lab) shipped, except 15.4 and 15.8 (Matt's accounts; optional). Seven experiments are
  live behind `lab()` flags, off by default and listed on `/lab/`, and four refactors ship for everyone. What each
  taught that is worth keeping: **(1)** 15.2: Cloudflare documents no field a Pro-plan Worker can read for a Web Bot Auth
  result, so the Worker verifies the signature itself and only counts; the agent's host is never recorded (an agent on a
  personal domain would identify a person). **(2)** 15.3: Cloudflare serves Markdown at the page's own URL, so the
  service worker has to skip any request that asks for it, or the Markdown comes back later as that page. **(3)** 15.5 and
  15.6: the shared field is live (about 50 ms between two pages on the real edge, 25 seats, and one address can fill them,
  accepted); a hero seed first only changed where particles start, the noise field needed an offset to be a different
  picture. **(4)** 15.9: the menu is a popover, pixel-identical, and works before and without the script, but the payload
  grew about 0.6 KB, so the plan's size measure was missed; the palette and keyboard help were left out because they
  need their module to do anything. **(5)** 15.10: the report-only header is live; a live pass found two sinks local tests
  cannot reach: the service worker's `register()` (https only, fixed in #355) and Cloudflare's own `email-decode`
  script, which uses `innerHTML` and is why enforcing needs a decision (Open items). **(6)** 15.11: Firefox 159 shipped
  scroll-driven animations, so the nav hairline needs no fallback; two of seven candidates were worth building. **(7)**
  15.13: Playwright's Chromium exposes `Summarizer` and `Translator` only as stubs, so the post tools have only been seen
  with fakes. **(8)** Process: a stacked PR is closed when its base branch is deleted after the base merges (#346 was
  lost this way and redone as #353): retarget to `main` before merging the base. **(9)** 15.14's eval `--serve` mode printed the results
  the page posts back, and CodeQL (`js/log-injection`) was right that anything that can reach `localhost` can post there; cleaning
  the values did not satisfy it, so nothing posted is printed any more (a number picks a label from a table, an id is replaced
  by the site's own string).

- **2026-11-18** — 15.14 (on-device ask) built, measured and kept in the lab. The model selects and the site speaks: the
  browser's Prompt API gets the site's list of projects and posts, may only answer with ids from it (a JSON schema whose ids
  are an enum), and the palette shows the picked pages' own copy with a note that a model chose them. Measured with the real
  model on 15 questions made from the site data (desktop Chrome 157, one run each): right page first 12 of 13, among the picks
  12 of 13, no page id that is not on the site in three runs, first answer about 9 s and later ones under 2 s. The plan's drop
  conditions (an invented slug, or a context that does not fit: about 1,100 tokens) did not trigger. Things worth keeping: **(1)**
  the first prompt never declined (a page for every question, "capital of Australia" included); having the answer start with
  `fits` and showing the model one example that does not fit made it decline 2 of 2, at the cost of one right answer. **(2)** My
  first negative question was about weather and the site has a weather app, so picking it was fair: a negative test has to be about
  something the site is not. **(3)** The five `mcp-eval` questions ask for facts, not pages, so the eval is its own set (`pnpm eval:ask`). **(4)** The model could not be measured from automation: Playwright's launch flags switch it off
  (`availability()` is `unavailable`), and a plain Chrome with a fresh profile sat at `downloading` for ten minutes with nothing
  fetched; it installed and ran only when run in the owner's own Chrome from a real click, hence `pnpm eval:ask --serve`. **(5)**
  Recall is measured, not precision, and the sample is small.

- **2026-11-17** — 15.12 (back/forward cache): the premise was wrong, so the work is a check and a guard, not a fix. The
  plan assumed an open presence WebSocket kept pages out of the cache. Measured in full Chromium (the headless shell opts out
  of the cache) on the live site, with the real socket open and with the Turnstile iframe loaded, `/`, a post and `/status/`
  are all restored (`pageshow` persisted, the same JavaScript context), with no blocking reason, because `initPresence`
  already closes its socket when the tab is hidden and opens a new one when it is shown again (confirmed: the first socket
  closed before leaving, a second opened after the restore and received messages). Shipped: `pnpm check:bfcache` (by hand;
  it fails with Chrome's own reason, shown by opening a popup: `RelatedActiveContentsExist`) and `tests/unit/bfcache-guards.test.js`
  (no `unload` or `beforeunload`, the presence close, no `no-store`). Findings worth keeping: Chrome now restores pages with an
  `unload` handler, with `Cache-Control: no-store` and with a request still in flight, so those are not the blockers they were;
  Playwright's mocked WebSocket is a script shim, not a real socket, so a local e2e says nothing about the real one; and
  Safari and Firefox were not tested.

- **2026-11-15** — Phase 15 (Lab) planned, 15.0 built. The 2026-11-11 "no ask feature" decision is narrowed: the
  browser's own built-in model may run as an opt-in experiment (nothing leaves the device, no cost); no
  server-side model runs for visitors, and Claude still never runs at visitor time. Experiments live behind
  `?lab=<name>` or a switch on `/lab/` (saved in `localStorage` only); `?hero=gpu` stays as an alias of
  `hero-gpu`. The default page never loads one, and an e2e test checks.
