/**
 * Shared client-side configuration.
 *
 * WORKER_BASE is the deployed Cloudflare Worker origin used by the dynamic
 * widgets (activity, views, guestbook, OG images). Point it at
 * http://localhost:8787 when developing against `pnpm worker:dev`.
 */

export const WORKER_BASE = 'https://and3rn3t-portfolio.andernet.workers.dev';
