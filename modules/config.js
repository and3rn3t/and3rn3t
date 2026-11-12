/**
 * Shared client-side configuration.
 *
 * WORKER_BASE is where the dynamic widgets (activity, views, guestbook) reach the Cloudflare
 * Worker. On andernet.dev the Worker answers at /api on the site's own origin (the route in
 * wrangler.toml), so those requests are same-origin: no CORS preflight, no second connection.
 * Anywhere else (local dev, the github.io mirror, e2e runs, Node) it is the Worker's own
 * address; the Worker also allows those origins. Point it at http://localhost:8787 when
 * developing against `pnpm worker:dev`.
 */

// Only the apex: the route in wrangler.toml matches andernet.dev/api/* and nothing else, and
// www.andernet.dev redirects to the apex (GitHub Pages), so no page ever runs on www. A host
// added here needs its own route first.
const SITE_HOSTS = new Set(['andernet.dev']);

export const WORKER_ORIGIN = 'https://and3rn3t-portfolio.andernet.workers.dev';

/**
 * @param {string | undefined} hostname - the page's hostname; undefined outside a browser
 * @returns {string} the base URL for Worker requests, with no trailing slash
 */
export function workerBase(hostname) {
    return SITE_HOSTS.has(hostname ?? '') ? '/api' : WORKER_ORIGIN;
}

export const WORKER_BASE = workerBase(globalThis.location?.hostname);
