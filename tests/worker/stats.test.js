/**
 * /api/stats and the uptime probe: the shaping of query rows, what is never published, caching,
 * and what happens when a query fails. The Analytics SQL binding is a fake that answers by query
 * name, so no test touches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index.js';
import { runProbe } from '../../worker/probe.js';
import {
    MIN_VITALS_SAMPLES,
    QUERIES,
    buildStats,
    loadStats,
    shapeClients,
    shapeCrawlers,
    shapeEdge,
    shapeTools,
    shapeUptime,
    shapeVitals,
    shapeWindow,
} from '../../worker/stats.js';

/** A binding that answers each fixed query with rows chosen by its name. */
function fakeBinding(rowsByName = {}, { fail = [], retryable = false } = {}) {
    const names = Object.entries(QUERIES);
    return {
        query: vi.fn(async ({ query }) => {
            const [name] = names.find(([, text]) => text === query) ?? [];
            if (fail.includes(name)) {
                throw Object.assign(new Error(`${name} failed`), { retryable });
            }
            return { data: rowsByName[name] ?? [], rows: 0, statistics: {} };
        }),
    };
}

beforeEach(() => {
    globalThis.caches = { default: { match: vi.fn(async () => null), put: vi.fn() } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
});

describe('the queries', () => {
    it('are fixed text: nothing a request sends can reach them', () => {
        for (const [name, text] of Object.entries(QUERIES)) {
            expect(text, name).not.toMatch(/\$[a-z]/i); // no parameters at all
            expect(text, name).toMatch(/^SELECT /);
            expect(text, name).not.toMatch(/accountTag|zoneTag/); // the binding supplies the scope
        }
    });

    it('count only real visitors for vitals, and only this host', () => {
        expect(QUERIES.vitals).toContain('bot = 0');
        expect(QUERIES.vitals).toContain("requestHost = 'andernet.dev'");
        expect(QUERIES.crawlers).toContain("clientRequestHttpHost = 'andernet.dev'");
    });

    it('never ask for a visitor country, address or user agent', () => {
        const all = Object.values(QUERIES).join(' ');
        expect(all).not.toMatch(/clientCountry|clientAsn|ja4|userAgent\b|ipAddress/i);
    });
});

describe('shaping', () => {
    it('shapeWindow gives requests, error rate and percentiles; null when there were none', () => {
        expect(shapeWindow([{ requests: 200, p50: 3.4, p95: 120.6 }], [{ errors: 2 }])).toEqual({
            requests: 200,
            errorRate: 0.01,
            p50Ms: 3,
            p95Ms: 121,
        });
        expect(shapeWindow([{ requests: 0 }], [{ errors: 0 }])).toBeNull();
        expect(shapeWindow(null, null)).toBeNull();
    });

    it('shapeWindow does not claim an error rate it could not measure', () => {
        expect(shapeWindow([{ requests: 10, p50: 1, p95: 2 }], null).errorRate).toBeNull();
    });

    it('shapeTools adds ok and error rows into one entry per tool, busiest first', () => {
        expect(
            shapeTools([
                { tool: 'list_posts', outcome: 'ok', calls: 5 },
                { tool: 'get_project', outcome: 'ok', calls: 9 },
                { tool: 'get_project', outcome: 'error', calls: 1 },
            ])
        ).toEqual([
            { tool: 'get_project', calls: 10, errors: 1 },
            { tool: 'list_posts', calls: 5, errors: 0 },
        ]);
        expect(shapeTools([])).toBeNull();
    });

    it('shapeClients is the agents share of API calls', () => {
        expect(
            shapeClients([
                { client: 'browser', requests: 75 },
                { client: 'agent', requests: 25 },
            ])
        ).toEqual({ agentShare: 0.25 });
        expect(shapeClients([{ client: 'browser', requests: 4 }])).toEqual({ agentShare: 0 });
        expect(shapeClients([])).toBeNull();
    });

    it('shapeUptime makes one entry per day and counts the successes', () => {
        const result = shapeUptime(
            [
                { day: '2026-11-12', outcome: 'ok', probes: 280 },
                { day: '2026-11-12', outcome: 'fail', probes: 8 },
                { day: '2026-11-11', outcome: 'ok', probes: 288 },
            ],
            [{ at: '2026-11-12T20:00:00Z' }]
        );
        expect(result.days).toEqual([
            { day: '2026-11-11', probes: 288, ok: 288 },
            { day: '2026-11-12', probes: 288, ok: 280 },
        ]);
        expect(result.lastProbeAt).toBe('2026-11-12T20:00:00Z');
        expect(shapeUptime([], [])).toBeNull();
    });

    it('shapeVitals is null below the minimum, and never returns the sample count', () => {
        const row = {
            samples: MIN_VITALS_SAMPLES,
            lcp: 440000,
            inp: 16000,
            cls: 0.0123,
            ttfb: 247000,
        };
        expect(shapeVitals([row])).toEqual({ lcpMs: 440, inpMs: 16, cls: 0.012, ttfbMs: 247 });
        expect(shapeVitals([{ ...row, samples: MIN_VITALS_SAMPLES - 1 }])).toBeNull();
        expect(JSON.stringify(shapeVitals([row]))).not.toMatch(/sample/i);
    });

    it('shapeVitals turns the API\'s "no data" (-1) into null, not a negative time', () => {
        const vitals = shapeVitals([{ samples: 50, lcp: 400000, inp: -1, cls: 0, ttfb: 200000 }]);
        expect(vitals.inpMs).toBeNull();
        expect(vitals.cls).toBe(0); // a measured zero stays a zero
    });

    it('shapeCrawlers and shapeEdge are aggregates', () => {
        expect(shapeCrawlers([{ category: 'AI Assistant', requests: 532 }])).toEqual([
            { category: 'AI Assistant', requests: 532 },
        ]);
        expect(
            shapeEdge([
                { served: 'edge', requests: 300 },
                { served: 'origin', requests: 100 },
            ])
        ).toEqual({ answeredAtEdge: 0.75 });
        expect(shapeEdge([])).toBeNull();
    });
});

describe('buildStats and loadStats', () => {
    it('answers null for a section whose query failed, and keeps the others', async () => {
        const env = {
            ANALYTICS_SQL: fakeBinding(
                { totals24h: [{ requests: 10, p50: 1, p95: 5 }], errors24h: [{ errors: 0 }] },
                { fail: ['vitals', 'crawlers'] }
            ),
        };
        const stats = await buildStats(env);
        expect(stats.api.last24h).toEqual({ requests: 10, errorRate: 0, p50Ms: 1, p95Ms: 5 });
        expect(stats.vitals).toBeNull();
        expect(stats.crawlers).toBeNull();
        expect(Date.parse(stats.generatedAt)).not.toBeNaN();
    });

    it('retries once when the error says it can be retried, and not otherwise', async () => {
        const flaky = fakeBinding({}, { fail: ['edge'], retryable: true });
        await buildStats({ ANALYTICS_SQL: flaky });
        const edgeCalls = flaky.query.mock.calls.filter(([{ query }]) => query === QUERIES.edge);
        expect(edgeCalls).toHaveLength(2);

        const firm = fakeBinding({}, { fail: ['edge'], retryable: false });
        await buildStats({ ANALYTICS_SQL: firm });
        expect(firm.query.mock.calls.filter(([{ query }]) => query === QUERIES.edge)).toHaveLength(
            1
        );
    });

    it('is unavailable without the binding (local dev)', async () => {
        expect(await loadStats({})).toEqual({ ok: false, error: 'stats_unavailable', status: 503 });
    });

    it('stores the result for five minutes, and serves it without asking again', async () => {
        const env = { ANALYTICS_SQL: fakeBinding() };
        const first = await loadStats(env);
        expect(first.cached).toBe(false);
        const [, stored] = globalThis.caches.default.put.mock.calls[0];
        expect(stored.headers.get('Cache-Control')).toBe('public, max-age=300');

        const callsBefore = env.ANALYTICS_SQL.query.mock.calls.length;
        globalThis.caches.default.match.mockResolvedValueOnce(
            new Response(JSON.stringify({ generatedAt: 'earlier' }))
        );
        const second = await loadStats(env);
        expect(second).toEqual({ ok: true, stats: { generatedAt: 'earlier' }, cached: true });
        expect(env.ANALYTICS_SQL.query.mock.calls.length).toBe(callsBefore);
    });
});

describe('GET /api/stats', () => {
    const get = (path = '/api/stats', init) =>
        worker.fetch(
            new Request(`https://andernet.dev${path}`, init),
            { ANALYTICS_SQL: fakeBinding() },
            {}
        );

    it('returns the stats as JSON that is briefly cacheable', async () => {
        const response = await get();
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
        const body = await response.json();
        expect(body).toMatchObject({ api: { last24h: null, last7d: null }, cached: false });
    });

    it('is a 503 without the binding, and answers only GET and the preflight', async () => {
        const bare = await worker.fetch(new Request('https://andernet.dev/api/stats'), {}, {});
        expect(bare.status).toBe(503);
        expect((await get('/api/stats', { method: 'POST' })).status).toBe(405);
        expect((await get('/api/stats', { method: 'OPTIONS' })).status).toBe(200);
    });

    it('is also reachable at the workers.dev address, without /api', async () => {
        expect((await get('/stats')).status).toBe(200);
    });
});

describe('the uptime probe', () => {
    const metrics = () => ({ writeDataPoint: vi.fn() });

    it('records an ok point for a page that answers', async () => {
        const env = { METRICS: metrics() };
        const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200 }));
        const result = await runProbe(env, fetchImpl);
        expect(result).toMatchObject({ ok: true, status: 200 });
        expect(fetchImpl.mock.calls[0][0]).toBe('https://andernet.dev/');
        expect(env.METRICS.writeDataPoint).toHaveBeenCalledWith({
            indexes: ['home'],
            blobs: ['probe', 'ok'],
            doubles: [200, expect.any(Number)],
        });
    });

    it.each([
        ['a 503', async () => new Response('down', { status: 503 }), 503],
        ['a network error', async () => Promise.reject(new Error('timeout')), 0],
    ])('records a fail point for %s', async (_name, fetchImpl, status) => {
        const env = { METRICS: metrics() };
        const result = await runProbe(env, fetchImpl);
        expect(result).toMatchObject({ ok: false, status });
        expect(env.METRICS.writeDataPoint.mock.calls[0][0].blobs).toEqual(['probe', 'fail']);
    });

    it('runs from the cron trigger', async () => {
        const env = { METRICS: metrics() };
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('ok', { status: 200 }))
        );
        await worker.scheduled({}, env, {});
        expect(env.METRICS.writeDataPoint).toHaveBeenCalledTimes(1);
        vi.unstubAllGlobals();
    });
});

describe('/api/health', () => {
    it('reports the deployed version', async () => {
        const response = await worker.fetch(
            new Request('https://andernet.dev/api/health'),
            { CF_VERSION: { id: 'abcdef0123456789', tag: '' } },
            {}
        );
        expect(await response.json()).toEqual({ ok: true, version: 'abcdef01' });
    });
});
