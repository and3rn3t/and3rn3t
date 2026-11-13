/**
 * The numbers behind the /status page and the get_site_stats MCP tool: how the API and the site
 * are doing, read through the Analytics SQL binding (env.ANALYTICS_SQL, scoped to this account,
 * no API token anywhere).
 *
 * Every query is fixed text: nothing from a request reaches the SQL. Every section of the answer
 * may be null, because a query can fail or a dataset can be empty, and the page then shows a dash.
 * A zero is only ever a measured zero.
 *
 * What is and is not published (Matt, 2026-11-12): performance, reliability and agent activity.
 * No counts of human visits over time and no geography. Human sample sizes are therefore never
 * returned, only whether there were enough samples to say anything.
 *
 * Workers-compatible: no Node built-ins.
 */

const DATASET = 'events.analyticsEngine.portfolio_metrics';
const SITE_HOST = 'andernet.dev';
const CACHE_SECONDS = 300;
const CACHE_KEY = 'https://cache.internal/stats';

/** Web Vitals are shown only with at least this many human samples in the window. */
export const MIN_VITALS_SAMPLES = 20;

/** The API routes (not /mcp, which has its own section, nor discovery documents). */
const API_ROUTES = "('/health','/views','/guestbook','/activity','/edge','/stats')";

const window = interval => `timestamp >= NOW() - INTERVAL '${interval}' DAY`;

/**
 * One Web Vital at p75 for real visitors. The API reports a metric it could not measure as -1
 * (INP, for instance, for a visit with no interaction), and a percentile over those would be
 * dragged down, so each metric is queried on its own with the missing values left out. `samples`
 * is the number of visits that measured it, used for the minimum and never returned.
 */
const vitalQuery = column =>
    `SELECT COUNT(*) AS samples, quantileExactWeighted(0.75)(${column}, sampleInterval) AS p75 FROM events.rumWebvitalsEvents WHERE requestHost = '${SITE_HOST}' AND bot = 0 AND ${column} >= 0 AND ${window(7)}`;

/** The fixed queries, by name. Exported so tests can check them and a script can try them. */
export const QUERIES = {
    totals24h: `SELECT COUNT(*) AS requests, quantileExactWeighted(0.5)(double2, sampleInterval) AS p50, quantileExactWeighted(0.95)(double2, sampleInterval) AS p95 FROM ${DATASET} WHERE blob1 = 'request' AND index1 IN ${API_ROUTES} AND ${window(1)}`,
    errors24h: `SELECT COUNT(*) AS errors FROM ${DATASET} WHERE blob1 = 'request' AND index1 IN ${API_ROUTES} AND double1 >= 500 AND ${window(1)}`,
    totals7d: `SELECT COUNT(*) AS requests, quantileExactWeighted(0.5)(double2, sampleInterval) AS p50, quantileExactWeighted(0.95)(double2, sampleInterval) AS p95 FROM ${DATASET} WHERE blob1 = 'request' AND index1 IN ${API_ROUTES} AND ${window(7)}`,
    errors7d: `SELECT COUNT(*) AS errors FROM ${DATASET} WHERE blob1 = 'request' AND index1 IN ${API_ROUTES} AND double1 >= 500 AND ${window(7)}`,
    tools: `SELECT index1 AS tool, blob2 AS outcome, COUNT(*) AS calls FROM ${DATASET} WHERE blob1 = 'tool' AND ${window(7)} GROUP BY tool, outcome ORDER BY calls DESC LIMIT 20`,
    clients: `SELECT blob4 AS client, COUNT(*) AS requests FROM ${DATASET} WHERE blob1 = 'request' AND index1 IN ${API_ROUTES} AND ${window(7)} GROUP BY client LIMIT 5`,
    uptime: `SELECT toDate(timestamp) AS day, blob2 AS outcome, COUNT(*) AS probes FROM ${DATASET} WHERE blob1 = 'probe' AND ${window(90)} GROUP BY day, outcome ORDER BY day LIMIT 400`,
    lastProbe: `SELECT timestamp AS at, blob2 AS outcome FROM ${DATASET} WHERE blob1 = 'probe' AND ${window(1)} ORDER BY timestamp DESC LIMIT 1`,
    vitalsLcp: vitalQuery('largestContentfulPaintUs'),
    vitalsInp: vitalQuery('interactionToNextPaintUs'),
    vitalsCls: vitalQuery('cumulativeLayoutShift'),
    vitalsTtfb: vitalQuery('timeToFirstByteUs'),
    crawlers: `SELECT verifiedBotCategory AS category, COUNT(*) AS requests FROM events.httpRequests WHERE clientRequestHttpHost = '${SITE_HOST}' AND verifiedBotCategory != '' AND ${window(7)} GROUP BY category ORDER BY requests DESC LIMIT 10`,
    edge: `SELECT CASE WHEN originResponseStatus = 0 THEN 'edge' ELSE 'origin' END AS served, COUNT(*) AS requests FROM events.httpRequests WHERE clientRequestHttpHost = '${SITE_HOST}' AND clientRequestPath NOT LIKE '/api/%' AND clientRequestPath NOT LIKE '/mcp%' AND requestSource = 'eyeball' AND ${window(1)} GROUP BY served LIMIT 5`,
};

const number = value => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null);
const round = (value, digits = 0) => {
    const n = number(value);
    return n === null ? null : Number(n.toFixed(digits));
};

/**
 * Run one query: null when it fails, after one retry if the error says it can be retried.
 * @returns {Promise<object[] | null>} the rows
 */
async function run(env, name) {
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = await env.ANALYTICS_SQL.query({ query: QUERIES[name] });
            return Array.isArray(result?.data) ? result.data : [];
        } catch (err) {
            if (!err?.retryable || attempt === 1) {
                console.warn(
                    JSON.stringify({
                        event: 'stats_query_failed',
                        query: name,
                        message: String(err?.message ?? err),
                    })
                );
                return null;
            }
        }
    }
    return null;
}

// ── Shaping: rows in, the published shape out ─────────────────────────────────

/**
 * The window's error rate and latency. The number of requests is deliberately not returned:
 * these are mostly the browsers of people visiting, and a count over time would publish
 * how many there are, which is not published (see the top of this file).
 * @returns {{ errorRate: number | null, p50Ms: number | null, p95Ms: number | null } | null}
 */
export function shapeWindow(totals, errors) {
    const row = totals?.[0];
    const requests = number(row?.requests);
    if (requests === null || requests === 0) return null;
    const failed = number(errors?.[0]?.errors);
    return {
        // Without the error count there is no error rate to claim
        errorRate: failed === null ? null : round(failed / requests, 4),
        p50Ms: round(row.p50),
        p95Ms: round(row.p95),
    };
}

/** @returns {{ tool: string, calls: number, errors: number }[] | null} */
export function shapeTools(rows) {
    if (!rows?.length) return null;
    const byTool = new Map();
    for (const { tool, outcome, calls } of rows) {
        const entry = byTool.get(tool) ?? { tool, calls: 0, errors: 0 };
        entry.calls += number(calls) ?? 0;
        if (outcome === 'error') entry.errors += number(calls) ?? 0;
        byTool.set(tool, entry);
    }
    return [...byTool.values()].sort((a, b) => b.calls - a.calls);
}

/** The share of API calls made by agents (not browsers), 0 to 1. */
export function shapeClients(rows) {
    if (!rows?.length) return null;
    const total = rows.reduce((sum, row) => sum + (number(row.requests) ?? 0), 0);
    if (total === 0) return null;
    const agents = rows.find(row => row.client === 'agent');
    return { agentShare: round((number(agents?.requests) ?? 0) / total, 3) };
}

/** One entry per day that had probes: the share of probes that succeeded. */
export function shapeUptime(rows, lastProbe) {
    if (!rows?.length) return null;
    const days = new Map();
    for (const { day, outcome, probes } of rows) {
        const key = String(day).slice(0, 10);
        const entry = days.get(key) ?? { day: key, probes: 0, ok: 0 };
        entry.probes += number(probes) ?? 0;
        if (outcome === 'ok') entry.ok += number(probes) ?? 0;
        days.set(key, entry);
    }
    return {
        lastProbe: lastProbe?.[0]?.at
            ? { at: lastProbe[0].at, ok: lastProbe[0].outcome === 'ok' }
            : null,
        days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
}

/**
 * One vital: its p75 when enough real visitors measured it, else null. `scale` converts the
 * API's microseconds to milliseconds.
 */
function shapeVital(rows, scale, digits = 0) {
    const row = rows?.[0];
    if ((number(row?.samples) ?? 0) < MIN_VITALS_SAMPLES) return null;
    const value = number(row.p75);
    return value === null || value < 0 ? null : round(value * scale, digits);
}

/**
 * Real visitors only (bots are excluded in the queries). Each metric has its own minimum number
 * of samples, so one that few visits measure (INP) is null while the others still show. The
 * sample counts are never returned.
 * @param {{ lcp?: object[] | null, inp?: object[] | null, cls?: object[] | null, ttfb?: object[] | null }} rows
 */
export function shapeVitals({ lcp, inp, cls, ttfb }) {
    const vitals = {
        lcpMs: shapeVital(lcp, 1 / 1000),
        inpMs: shapeVital(inp, 1 / 1000),
        cls: shapeVital(cls, 1, 3),
        ttfbMs: shapeVital(ttfb, 1 / 1000),
    };
    return Object.values(vitals).every(value => value === null) ? null : vitals;
}

/** Verified crawlers by category, busiest first. Aggregates only. */
export function shapeCrawlers(rows) {
    if (!rows?.length) return null;
    return rows.map(({ category, requests }) => ({ category, requests: number(requests) ?? 0 }));
}

/** Of the pages and files asked for in the last day, how many were answered without asking GitHub, 0 to 1. */
export function shapeEdge(rows) {
    if (!rows?.length) return null;
    const total = rows.reduce((sum, row) => sum + (number(row.requests) ?? 0), 0);
    if (total === 0) return null;
    const edge = rows.find(row => row.served === 'edge');
    return { answeredAtEdge: round((number(edge?.requests) ?? 0) / total, 3) };
}

/**
 * Everything, fresh from the queries.
 * @param {{ ANALYTICS_SQL?: { query: Function } }} env
 */
export async function buildStats(env) {
    const names = Object.keys(QUERIES);
    const results = await Promise.all(names.map(name => run(env, name)));
    const r = Object.fromEntries(names.map((name, index) => [name, results[index]]));
    return {
        generatedAt: new Date().toISOString(),
        api: {
            last24h: shapeWindow(r.totals24h, r.errors24h),
            last7d: shapeWindow(r.totals7d, r.errors7d),
        },
        mcp: shapeTools(r.tools),
        clients: shapeClients(r.clients),
        uptime: shapeUptime(r.uptime, r.lastProbe),
        vitals: shapeVitals({
            lcp: r.vitalsLcp,
            inp: r.vitalsInp,
            cls: r.vitalsCls,
            ttfb: r.vitalsTtfb,
        }),
        crawlers: shapeCrawlers(r.crawlers),
        edge: shapeEdge(r.edge),
    };
}

// One refresh at a time per isolate: when the cache entry expires, a burst of requests shares
// the queries already running instead of each starting its own scans. (Other isolates still
// refresh on their own; this coalesces within one.) Cleared when the refresh ends, success or not.
let refreshing = null;

async function refresh(env, cache, key) {
    const stats = await buildStats(env);
    try {
        await cache?.put(
            key,
            new Response(JSON.stringify(stats), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
                },
            })
        );
    } catch (err) {
        // Not stored: the next request refreshes again. These stats are still good to return.
        console.warn(
            JSON.stringify({
                event: 'stats_cache_put_failed',
                message: String(err?.message ?? err),
            })
        );
    }
    return stats;
}

/**
 * The stats, from the edge cache for five minutes (the queries scan tens of millions of rows).
 * @returns {Promise<{ ok: true, stats: object, cached: boolean } | { ok: false, error: string, status: number }>}
 */
export async function loadStats(env) {
    if (!env?.ANALYTICS_SQL) return { ok: false, error: 'stats_unavailable', status: 503 };

    const cache = globalThis.caches?.default;
    const key = new Request(CACHE_KEY);
    const hit = await cache?.match(key);
    if (hit) return { ok: true, stats: await hit.json(), cached: true };

    refreshing ??= refresh(env, cache, key).finally(() => {
        refreshing = null;
    });
    return { ok: true, stats: await refreshing, cached: false };
}
