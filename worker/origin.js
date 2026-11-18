/**
 * Which browser origins may use the Worker. Shared by the CORS headers (http.js) and the
 * presence WebSocket (presence.js), so the two cannot drift apart.
 *
 * Workers-compatible: no Node built-ins.
 */

import { SITE_ORIGIN } from './site-data.js';

export const ALLOWED_ORIGINS = new Set([SITE_ORIGIN, 'https://and3rn3t.github.io']);
export const FALLBACK_ORIGIN = SITE_ORIGIN;

/** Exact match on the parsed origin: "http://localhost.evil.com" must not pass as localhost. */
export function isLocalOrigin(origin) {
    try {
        const { protocol, hostname } = new URL(origin);
        return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
    } catch {
        return false;
    }
}

/** @param {string} origin - the Origin header, or '' when there is none */
export const isAllowedOrigin = origin => ALLOWED_ORIGINS.has(origin) || isLocalOrigin(origin);
