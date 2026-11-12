/**
 * The edge cache rule for andernet.dev, as a Cloudflare cache rule. scripts/cloudflare-zone.mjs
 * applies it; this file only says what it is, so the tests can check it without an API.
 *
 * GitHub Pages sends every page and data file with `max-age=600` and Cloudflare does not cache
 * HTML or JSON by default, so every visit went to GitHub (cf-cache-status: DYNAMIC). This rule
 * makes the site cacheable at the edge for an hour. pages.yml purges the host after every
 * deploy, so a new page or a daily data refresh is not served stale.
 *
 * Scoped to the apex host: the zone carries about twenty other apps.
 */

import { HOST, RULE_PREFIX } from './zone-headers.mjs';

/** How long the edge keeps a copy. The purge after each deploy is what makes this safe. */
export const EDGE_TTL_SECONDS = 3600;

// What the Worker answers (it has its own caching), and agents asking for Markdown: Cloudflare
// converts those per request and its interaction with a cached HTML copy is not documented, so
// they are left exactly as they were.
export const CACHE_EXPRESSION = [
  `http.host eq "${HOST}"`,
  'not starts_with(http.request.uri.path, "/api/")',
  'http.request.uri.path ne "/mcp"',
  'not starts_with(http.request.uri.path, "/.well-known/")',
  'not any(http.request.headers["accept"][*] contains "text/markdown")',
].join(' and ');

/** The rules, keyed by ref. */
export function cacheRules() {
  return {
    [`${RULE_PREFIX}cache-site`]: {
      description: 'Cache the site at the edge (purged on every deploy)',
      expression: CACHE_EXPRESSION,
      action: 'set_cache_settings',
      enabled: true,
      action_parameters: {
        cache: true,
        edge_ttl: {
          mode: 'override_origin',
          default: EDGE_TTL_SECONDS,
          // Only successful pages are kept: a 404 for a page that is about to be published, or
          // a 5xx from a bad moment at the origin, must not stick for an hour
          status_code_ttl: [
            { status_code_range: { from: 200, to: 299 }, value: EDGE_TTL_SECONDS },
            { status_code_range: { from: 400, to: 599 }, value: -1 },
          ],
        },
        // The browser keeps following GitHub's own max-age=600
        browser_ttl: { mode: 'respect_origin' },
      },
    },
  };
}
