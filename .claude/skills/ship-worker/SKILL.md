---
name: ship-worker
description: Deploy the portfolio Worker (and3rn3t-portfolio) to Cloudflare and verify it live. Use when Matt says "deploy" or asks to ship worker/ changes.
disable-model-invocation: true
---

Deploys change production for andernet.dev. Run this only when Matt has said "deploy" in this conversation; "it is merged" is not a go. Never chain deploy with merge or push.

1. Confirm the tree: `git status` is clean and you are on `main` at the merged commit (`git log -1`).
2. `pnpm build:worker` (a dry run). Stop on any error.
3. `pnpm test:unit` (includes `tests/worker`). Stop on any failure.
4. Note the current version for rollback: `pnpm exec wrangler deployments list` and copy the newest id.
5. `pnpm deploy:worker`. Copy the new version id from the output.
6. Verify live, with the final status code only (`curl -s -o /dev/null -w '%{http_code}' <url>`; Early Hints can print a `103` first):
   - `https://andernet.dev/api/health` is 200
   - `https://andernet.dev/mcp` answers `tools/list` (POST JSON-RPC with `Accept: application/json, text/event-stream`; the reply is SSE `data:` lines)
   - `https://andernet.dev/.well-known/api-catalog` is 200
   - `pnpm check:probe` passes after a few minutes
7. Report: new version id, rollback id (`pnpm exec wrangler rollback <id>`), and each check's result. If a check fails, say so and offer the rollback; do not roll back without being asked.
8. Record the version and rollback ids in the current phase's memory file.

If the change adds or removes a route in `wrangler.toml`, say so first: routes are created on the zone.
