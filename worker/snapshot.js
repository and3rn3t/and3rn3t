/**
 * Snapshots: the answers to the two slow routes, /activity (GitHub) and /stats (Analytics SQL),
 * built by the five-minute cron (see scheduled() in index.js) and kept in KV, which is global.
 *
 * The Cache API those routes used before is per Cloudflare location, so at this traffic almost
 * every visitor request found it cold and waited for GitHub or the SQL scans (p95 2.9 s and
 * 4.4 s). A request now reads a snapshot, and builds the answer itself only when there is none
 * or it is stale (the old path, unchanged).
 *
 * The snapshots live in VIEWS_KV under a `snapshot:` prefix: the views counter only uses the page
 * slug `home`. Without the binding (local dev, tests) every function here does nothing.
 *
 * Workers-compatible: no Node built-ins.
 */

/** A snapshot older than this is not served: the cron has missed three runs in a row. */
export const MAX_SNAPSHOT_AGE_MS = 15 * 60 * 1000;

const PREFIX = 'snapshot:';

/**
 * @param {{ VIEWS_KV?: KVNamespace }} env
 * @param {string} name
 * @param {number} [now]
 * @returns {Promise<{ value: any, at: number } | null>} the snapshot if there is a fresh one
 */
export async function readSnapshot(env, name, now = Date.now()) {
    if (!env?.VIEWS_KV) return null;
    try {
        const stored = await env.VIEWS_KV.get(`${PREFIX}${name}`, 'json');
        if (!stored || typeof stored.at !== 'number' || stored.value == null) return null;
        if (now - stored.at > MAX_SNAPSHOT_AGE_MS) return null;
        return stored;
    } catch (err) {
        // A KV hiccup must not fail the request: the caller builds the answer itself
        console.warn(`[snapshot] read of ${name} failed:`, err?.message ?? err);
        return null;
    }
}

/**
 * Store a snapshot. Never throws: a failed write leaves the previous snapshot in place.
 * @param {{ VIEWS_KV?: KVNamespace }} env
 * @param {string} name
 * @param {any} value - JSON-serialisable and not null
 * @param {number} [now]
 * @returns {Promise<boolean>} whether it was written
 */
export async function writeSnapshot(env, name, value, now = Date.now()) {
    if (!env?.VIEWS_KV || value == null) return false;
    try {
        await env.VIEWS_KV.put(`${PREFIX}${name}`, JSON.stringify({ at: now, value }));
        return true;
    } catch (err) {
        console.warn(`[snapshot] write of ${name} failed:`, err?.message ?? err);
        return false;
    }
}
