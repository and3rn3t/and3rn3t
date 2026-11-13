/**
 * The uptime probe: every five minutes (a cron trigger) the Worker asks for the home page the
 * way a visitor does, and records whether it answered and how long it took. The /status page
 * draws its uptime history from these points.
 *
 * It goes through Cloudflare's edge and its cache, as a visitor's request does, so it measures
 * what visitors get. A site that is down at the origin but still answered from a cached copy
 * reads as up, which is also what visitors see; the origin has its own health check (12.7).
 *
 * Workers-compatible: no Node built-ins.
 */

import { SITE_ORIGIN } from './site-data.js';
import { recordProbe } from './telemetry.js';

const TIMEOUT_MS = 8000;

/**
 * @param {object} env
 * @param {typeof fetch} [fetchImpl] - replaceable in tests
 * @returns {Promise<{ ok: boolean, status: number, ms: number }>}
 */
export async function runProbe(env, fetchImpl = fetch) {
    const started = Date.now();
    let status = 0;
    try {
        const response = await fetchImpl(`${SITE_ORIGIN}/`, {
            headers: { 'User-Agent': 'andernet-status-probe/1.0' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        status = response.status;
        await response.body?.cancel();
    } catch {
        // A timeout or a network error is a failed probe, recorded as status 0
    }
    const result = { ok: status >= 200 && status < 400, status, ms: Date.now() - started };
    recordProbe(env, result);
    return result;
}
