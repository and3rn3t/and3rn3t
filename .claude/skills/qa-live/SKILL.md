---
name: qa-live
description: Check the live andernet.dev after a deploy or merge: headers, Worker endpoints, MCP, agent readiness, and a browser pass with Playwright. Read-only. Use for "is it working live" or "verify the deploy".
---

Read-only checks against production. Do not POST to `/api/views` or `/api/guestbook`, and do not use the browser pane for visual checks: a hidden tab gives blank screenshots and frozen animation, so use Playwright.

1. **Endpoints** (final status code only: `curl -s -o /dev/null -w '%{http_code}' <url>`): `/`, `/api/health`, `/api/edge`, `/api/stats`, `/status/`, `/llms.txt`, `/robots.txt`, `/.well-known/security.txt`, `/.well-known/api-catalog`.
2. **MCP:** POST JSON-RPC `tools/list` to `/mcp` with `Accept: application/json, text/event-stream`. Expect 8 tools, each with a `title` and `annotations.readOnlyHint: true`. Call `get_profile` once.
3. **Headers on `/`:** `Link`, `Content-Security-Policy-Report-Only` (or the enforced header once Matt has switched it), `Strict-Transport-Security`, `X-Content-Type-Options`.
4. **Agent readiness:** `pnpm check:agent-ready` (report only; the expected level is 4 of 5, with a few checks failing on purpose).
5. **Browser pass** in a script under the scratchpad directory, never in the repo: Playwright Chromium, block `cloudflareinsights.com` and abort any POST to `/api/`, visit the five pages in light and dark (`colorScheme`), and collect console errors and CSP violation events. Known noise: the Cloudflare Web Analytics beacon fails CORS on page leave.
6. Report what passed and what did not, with the numbers. Do not fix anything unless asked.
