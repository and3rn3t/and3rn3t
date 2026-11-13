---
name: zone-apply
description: Show or apply the Cloudflare zone settings for andernet.dev from scripts/cloudflare-zone.mjs (TLS, AI crawlers, headers, cache, security.txt). Use when Matt asks about zone drift or says to apply a zone group.
disable-model-invocation: true
---

The zone settings live in code; `pnpm zone` compares the live zone with them. The dry run is always safe. Writing needs Matt to name the command, for example "run pnpm zone --only headers --apply".

1. Dry run first: `pnpm zone` (or `pnpm zone --only <group>`). Groups: `tls`, AI crawlers, `headers`, cache, `security-txt`. Show the diff in plain words.
2. Before any write, check three things:
   - **Scope.** SSL mode and min TLS are zone-wide: about 20 other subdomains share them. Headers and cache rules are scoped to `http.host eq "andernet.dev"`.
   - **CSP hashes** are computed from the generated pages. If an inline script or style changed since the last apply, the `headers` group has changed too.
   - **Rollback.** For headers: delete the three `andernet-*` rules under Rules > Transform > Modify Response Header. For cache rules: the `andernet-*` rules under Rules > Cache Rules.
3. Apply only the group Matt named: `pnpm zone --only <group> --apply`. The script reads the values back.
4. Verify with curl on the final status code, on andernet.dev and on a sample of other subdomains (their statuses must not change). Headers: `curl -sI https://andernet.dev/ | grep -iE 'link|content-security|strict-transport|x-content-type'`.
5. If you changed headers, load a few pages in headless Chromium and check the console for CSP violations (both themes, plus `offline.html`).
6. The token is in the gitignored `.cloudflare.env` (`token=...`). Never print it or put it in `.dev.vars`.
