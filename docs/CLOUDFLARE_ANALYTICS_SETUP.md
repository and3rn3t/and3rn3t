# Cloudflare Web Analytics

The site uses Cloudflare Web Analytics as its only analytics. It is cookie-free and collects page
views, referrers, browsers and countries. There are no custom events.

## How it is loaded

`index.html` appends the beacon 500 ms after load:

```html
<script
  defer
  src="https://static.cloudflareinsights.com/beacon.min.js"
  data-cf-beacon='{"token": "…", "spa": true}'
></script>
```

- `spa: true` tells the beacon the page updates its URL without full reloads.
- The generated `posts/*/index.html` pages load the same script, with the token only.
- The site token is public by design: it is served in every page. It is allowlisted by exact value
  in `.gitleaks.toml` and `.gitguardian.yaml`, so any other token is still reported.

## Verify it works

1. Open [andernet.dev](https://andernet.dev) with DevTools → Network and look for
   `beacon.min.js` from `static.cloudflareinsights.com`. In the console, `window.__cfBeacon`
   should be an object.
2. Data is sent when the page is hidden or closed, so switch tabs once and then check the
   Cloudflare dashboard (Analytics & Logs → Web Analytics). New data can take several minutes to
   appear.

## Troubleshooting

- **No beacon request:** an ad or tracking blocker is the usual cause. Test in a clean profile.
- **No data in the dashboard:** the token is tied to the registered hostname. `localhost` and
  preview URLs report nothing.
- **Changing the token:** edit it in `index.html` and in `scripts/generate-posts.mjs`
  (`CF_BEACON_TOKEN`), run `pnpm generate:posts`, and update the two allowlists above.
