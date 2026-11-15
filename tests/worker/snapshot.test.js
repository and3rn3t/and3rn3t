/**
 * The cron-built snapshots of /activity and /stats (worker/snapshot.js): a request reads them
 * instead of waiting for GitHub or the SQL scans, and a failed refresh never replaces a good one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SNAPSHOT_AGE_MS, readSnapshot, writeSnapshot } from '../../worker/snapshot.js';
import { QUERIES, hasData, loadStats } from '../../worker/stats.js';

const { default: worker, loadActivity } = await import('../../worker/index.js');

/** A Map-backed KV that honours the `'json'` read type. */
function makeKV() {
    const store = new Map();
    return {
        store,
        get: vi.fn(async (key, type) => {
            const raw = store.get(key) ?? null;
            return raw !== null && type === 'json' ? JSON.parse(raw) : raw;
        }),
        put: vi.fn(async (key, value) => {
            store.set(key, value);
        }),
    };
}

const NOW = Date.parse('2026-11-15T12:00:00Z');
const activity = {
    repo: 'and3rn3t/guess',
    repoName: 'guess',
    repoUrl: 'https://github.com/and3rn3t/guess',
    pushedAt: '2026-11-15T11:00:00Z',
    type: 'push',
    message: 'feat: x',
    branch: 'main',
};
const event = {
    type: 'PushEvent',
    repo: { name: 'and3rn3t/guess' },
    created_at: new Date().toISOString(),
    payload: { ref: 'refs/heads/main', commits: [{ sha: 'a', message: 'feat: new' }] },
};

/** A fetch that answers GitHub's events (or fails when `ok` is false), and the site's pages. */
const githubFetch = ({ ok = true } = {}) =>
    vi.fn(async url =>
        String(url).includes('/events/public')
            ? ok
                ? Response.json([structuredClone(event)])
                : new Response('nope', { status: 500 })
            : new Response('{}', { status: 200 })
    );

const statsBinding = (fail = false) => ({
    query: vi.fn(async ({ query }) => {
        if (fail) throw new Error('SQL is down');
        const [name] = Object.entries(QUERIES).find(([, text]) => text === query) ?? [];
        // One real row so the answer has data in it
        return {
            data: name === 'tools' ? [{ tool: 'get_profile', outcome: 'ok', calls: 3 }] : [],
        };
    }),
});

beforeEach(() => {
    globalThis.caches = { default: { match: vi.fn(async () => null), put: vi.fn() } };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('readSnapshot and writeSnapshot', () => {
    it('do nothing without the KV binding', async () => {
        expect(await readSnapshot({}, 'x')).toBeNull();
        expect(await writeSnapshot({}, 'x', { a: 1 })).toBe(false);
    });

    it('round-trip a value, stamped with its time', async () => {
        const env = { VIEWS_KV: makeKV() };
        expect(await writeSnapshot(env, 'x', { a: 1 }, NOW)).toBe(true);
        expect(await readSnapshot(env, 'x', NOW + 1000)).toEqual({ value: { a: 1 }, at: NOW });
        // Under a prefix that cannot collide with the views counter's page slug
        expect([...env.VIEWS_KV.store.keys()]).toEqual(['snapshot:x']);
    });

    it('treat a snapshot past the maximum age as absent', async () => {
        const env = { VIEWS_KV: makeKV() };
        await writeSnapshot(env, 'x', { a: 1 }, NOW);
        expect(await readSnapshot(env, 'x', NOW + MAX_SNAPSHOT_AGE_MS)).not.toBeNull();
        expect(await readSnapshot(env, 'x', NOW + MAX_SNAPSHOT_AGE_MS + 1)).toBeNull();
    });

    it('never store nothing, and never throw when KV does', async () => {
        const env = { VIEWS_KV: makeKV() };
        expect(await writeSnapshot(env, 'x', null)).toBe(false);
        expect(env.VIEWS_KV.put).not.toHaveBeenCalled();

        env.VIEWS_KV.put.mockRejectedValueOnce(new Error('KV down'));
        expect(await writeSnapshot(env, 'x', { a: 1 })).toBe(false);
        env.VIEWS_KV.get.mockRejectedValueOnce(new Error('KV down'));
        expect(await readSnapshot(env, 'x')).toBeNull();
    });

    it('ignore a value that is not a snapshot', async () => {
        const env = { VIEWS_KV: makeKV() };
        env.VIEWS_KV.store.set('snapshot:x', JSON.stringify({ nothing: true }));
        expect(await readSnapshot(env, 'x')).toBeNull();
    });
});

describe('loadActivity', () => {
    it('serves a fresh snapshot without asking GitHub', async () => {
        const env = { VIEWS_KV: makeKV() };
        await writeSnapshot(env, 'activity', activity);
        const fetchMock = githubFetch();
        vi.stubGlobal('fetch', fetchMock);

        expect(await loadActivity(env)).toEqual({ ok: true, activity, cached: true });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('asks GitHub when there is no snapshot, and stores the answer for the next request', async () => {
        const env = { VIEWS_KV: makeKV() };
        vi.stubGlobal('fetch', githubFetch());

        const first = await loadActivity(env);
        expect(first).toMatchObject({ ok: true, cached: false });
        expect(env.VIEWS_KV.store.has('snapshot:activity')).toBe(true);
    });
});

describe('loadStats', () => {
    it('serves a fresh snapshot without running the queries', async () => {
        const env = { VIEWS_KV: makeKV(), ANALYTICS_SQL: statsBinding() };
        const stats = { generatedAt: 'then', mcp: [] };
        await writeSnapshot(env, 'stats', stats);

        expect(await loadStats(env)).toEqual({ ok: true, stats, cached: true });
        expect(env.ANALYTICS_SQL.query).not.toHaveBeenCalled();
    });

    it('builds and stores the stats when there is no snapshot', async () => {
        const env = { VIEWS_KV: makeKV(), ANALYTICS_SQL: statsBinding() };
        const result = await loadStats(env);
        expect(result.cached).toBe(false);
        expect(env.VIEWS_KV.store.has('snapshot:stats')).toBe(true);
    });

    it('does not store a run in which every query failed', async () => {
        const env = { VIEWS_KV: makeKV(), ANALYTICS_SQL: statsBinding(true) };
        const result = await loadStats(env);
        expect(result.ok).toBe(true); // the request still gets its (all-null) answer
        expect(hasData(result.stats)).toBe(false);
        expect(env.VIEWS_KV.store.has('snapshot:stats')).toBe(false);
    });
});

describe('the cron (scheduled)', () => {
    const run = env => worker.scheduled({}, env, { waitUntil() {} });

    it('refreshes both snapshots after the probe', async () => {
        const env = { VIEWS_KV: makeKV(), ANALYTICS_SQL: statsBinding() };
        vi.stubGlobal('fetch', githubFetch());
        await run(env);
        expect([...env.VIEWS_KV.store.keys()].sort()).toEqual([
            'snapshot:activity',
            'snapshot:stats',
        ]);
    });

    it('leaves the last good snapshots in place when both sources are down', async () => {
        const env = { VIEWS_KV: makeKV(), ANALYTICS_SQL: statsBinding(true) };
        await writeSnapshot(env, 'activity', activity, Date.now());
        await writeSnapshot(env, 'stats', { generatedAt: 'good', mcp: [] }, Date.now());
        const before = new Map(env.VIEWS_KV.store);
        vi.stubGlobal('fetch', githubFetch({ ok: false }));

        await run(env);

        expect(env.VIEWS_KV.store).toEqual(before);
    });

    it('does not stop one refresh because the other failed', async () => {
        const env = { VIEWS_KV: makeKV(), ANALYTICS_SQL: statsBinding(true) };
        vi.stubGlobal('fetch', githubFetch());
        await run(env);
        expect([...env.VIEWS_KV.store.keys()]).toEqual(['snapshot:activity']);
    });
});
