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
        for (const name of ['vitalsLcp', 'vitalsInp', 'vitalsCls', 'vitalsTtfb']) {
            expect(QUERIES[name], name).toContain('bot = 0');
            expect(QUERIES[name], name).toContain("requestHost = 'andernet.dev'");
        }
        expect(QUERIES.crawlers).toContain("clientRequestHttpHost = 'andernet.dev'");
    });

    // The API reports "could not measure" as -1; a percentile over those is dragged down
    it('leave out the values the API could not measure, for each vital on its own', () => {
        expect(QUERIES.vitalsLcp).toContain('largestContentfulPaintUs >= 0');
        expect(QUERIES.vitalsInp).toContain('interactionToNextPaintUs >= 0');
        expect(QUERIES.vitalsCls).toContain('cumulativeLayoutShift >= 0');
        expect(QUERIES.vitalsTtfb).toContain('timeToFirstByteUs >= 0');
    });

    it('never ask for a visitor country, address or user agent', () => {
        const all = Object.values(QUERIES).join(' ');
        expect(all).not.toMatch(/clientCountry|clientAsn|ja4|userAgent\b|ipAddress/i);
    });
});

describe('shaping', () => {
    it('shapeWindow gives the error rate and percentiles; null when there were none', () => {
        expect(shapeWindow([{ requests: 200, p50: 3.4, p95: 120.6 }], [{ errors: 2 }])).toEqual({
            errorRate: 0.01,
            p50Ms: 3,
            p95Ms: 121,
        });
        expect(shapeWindow([{ requests: 0 }], [{ errors: 0 }])).toBeNull();
        expect(shapeWindow(null, null)).toBeNull();
    });

    // How many people visit is not published; the API calls are mostly their browsers
    it('shapeWindow never returns a request count', () => {
        const window = shapeWindow([{ requests: 9999, p50: 1, p95: 2 }], [{ errors: 0 }]);
        expect(Object.keys(window)).toEqual(['errorRate', 'p50Ms', 'p95Ms']);
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
            [{ at: '2026-11-12T20:00:00Z', outcome: 'ok' }]
        );
        expect(result.days).toEqual([
            { day: '2026-11-11', probes: 288, ok: 288 },
            { day: '2026-11-12', probes: 288, ok: 280 },
        ]);
        expect(result.lastProbe).toEqual({ at: '2026-11-12T20:00:00Z', ok: true });
        expect(
            shapeUptime(
                [{ day: '2026-11-12', outcome: 'fail', probes: 1 }],
                [{ at: '2026-11-12T20:05:00Z', outcome: 'fail' }]
            ).lastProbe.ok
        ).toBe(false);
        expect(
            shapeUptime([{ day: '2026-11-12', outcome: 'ok', probes: 1 }], []).lastProbe
        ).toBeNull();
        expect(shapeUptime([], [])).toBeNull();
    });

    const vital = (samples, p75) => [{ samples, p75 }];

    it('shapeVitals converts to ms and never returns a sample count', () => {
        const vitals = shapeVitals({
            lcp: vital(MIN_VITALS_SAMPLES, 440000),
            inp: vital(MIN_VITALS_SAMPLES, 16000),
            cls: vital(MIN_VITALS_SAMPLES, 0.0123),
            ttfb: vital(MIN_VITALS_SAMPLES, 247000),
        });
        expect(vitals).toEqual({ lcpMs: 440, inpMs: 16, cls: 0.012, ttfbMs: 247 });
        expect(JSON.stringify(vitals)).not.toMatch(/sample/i);
    });

    it('shapeVitals gives each vital its own minimum, so one few visits measure is null', () => {
        expect(
            shapeVitals({
                lcp: vital(MIN_VITALS_SAMPLES, 400000),
                inp: vital(MIN_VITALS_SAMPLES - 1, 40000),
                cls: vital(MIN_VITALS_SAMPLES, 0),
                ttfb: vital(MIN_VITALS_SAMPLES, 200000),
            })
        ).toEqual({ lcpMs: 400, inpMs: null, cls: 0, ttfbMs: 200 }); // a measured zero stays a zero
    });

    it('shapeVitals is null when nothing has enough samples', () => {
        expect(
            shapeVitals({ lcp: vital(3, 400000), inp: [], cls: null, ttfb: undefined })
        ).toBeNull();
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

/**
 * A binding that answers the four vitals queries by computing p75 from real-looking samples,
 * and applies the `>= 0` filter only if the query asks for it. So a query that stops leaving
 * out missing values (-1) gives a different, wrong answer here, as it would in production.
 */
function vitalsBinding(visits) {
    const columns = {
        vitalsLcp: ['lcp', 'largestContentfulPaintUs'],
        vitalsInp: ['inp', 'interactionToNextPaintUs'],
        vitalsCls: ['cls', 'cumulativeLayoutShift'],
        vitalsTtfb: ['ttfb', 'timeToFirstByteUs'],
    };
    return {
        query: vi.fn(async ({ query }) => {
            const [name] = Object.entries(QUERIES).find(([, text]) => text === query) ?? [];
            if (!columns[name]) return { data: [] };
            const [key, column] = columns[name];
            let values = visits.map(visit => visit[key]);
            if (query.includes(`${column} >= 0`)) values = values.filter(value => value >= 0);
            values.sort((a, b) => a - b);
            const p75 = values[Math.ceil(values.length * 0.75) - 1];
            return { data: [{ samples: values.length, p75 }] };
        }),
    };
}

describe('vitals with visits that could not measure everything', () => {
    // 40 real visits: half never interacted, so the API reports their INP as -1
    const visits = [
        ...Array.from({ length: 20 }, () => ({ lcp: 400000, inp: -1, cls: 0, ttfb: 200000 })),
        ...Array.from({ length: 10 }, () => ({ lcp: 400000, inp: 20000, cls: 0, ttfb: 200000 })),
        ...Array.from({ length: 10 }, () => ({ lcp: 400000, inp: 80000, cls: 0, ttfb: 200000 })),
    ];

    it('computes INP from the visits that measured it, not from the missing values', async () => {
        const stats = await buildStats({ ANALYTICS_SQL: vitalsBinding(visits) });
        // Over the 20 measured visits the p75 is 80 ms. Counting the -1s it would read 20 ms.
        expect(stats.vitals.inpMs).toBe(80);
        expect(stats.vitals).toMatchObject({ lcpMs: 400, cls: 0, ttfbMs: 200 });
    });

    it('does not report INP at all when too few visits measured it', async () => {
        const mostlyUnmeasured = visits.map((visit, index) =>
            index < 32 ? { ...visit, inp: -1 } : visit
        );
        const stats = await buildStats({ ANALYTICS_SQL: vitalsBinding(mostlyUnmeasured) });
        expect(stats.vitals.inpMs).toBeNull();
        expect(stats.vitals.lcpMs).toBe(400);
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
        expect(stats.api.last24h).toEqual({ errorRate: 0, p50Ms: 1, p95Ms: 5 });
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

describe('refreshing when the cache is empty', () => {
    it('shares one set of queries between requests that arrive together', async () => {
        let release;
        const gate = new Promise(resolve => {
            release = resolve;
        });
        const ANALYTICS_SQL = { query: vi.fn(async () => (await gate, { data: [] })) };

        const burst = Promise.all([1, 2, 3, 4, 5].map(() => loadStats({ ANALYTICS_SQL })));
        await new Promise(resolve => setTimeout(resolve, 0));
        release();
        const results = await burst;

        expect(ANALYTICS_SQL.query).toHaveBeenCalledTimes(Object.keys(QUERIES).length);
        expect(new Set(results.map(result => result.stats.generatedAt)).size).toBe(1);
        expect(results.every(result => result.ok && result.cached === false)).toBe(true);
    });

    it('starts a fresh refresh once the last one is done, even if it failed', async () => {
        const ANALYTICS_SQL = fakeBinding({}, { fail: Object.keys(QUERIES) });
        await loadStats({ ANALYTICS_SQL });
        const afterFirst = ANALYTICS_SQL.query.mock.calls.length;
        await loadStats({ ANALYTICS_SQL });
        expect(ANALYTICS_SQL.query.mock.calls.length).toBe(afterFirst * 2);
    });

    it('still returns the stats when they could not be stored', async () => {
        globalThis.caches.default.put.mockRejectedValueOnce(new Error('cache full'));
        const result = await loadStats({ ANALYTICS_SQL: fakeBinding() });
        expect(result.ok).toBe(true);
        expect(result.stats.generatedAt).toBeTruthy();
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
