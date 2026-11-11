/**
 * Worker /activity tests — GitHub API and the CF edge cache are mocked.
 *
 * GitHub's events API no longer includes PushEvent commit lists or
 * PullRequestEvent titles; the worker hydrates them for the picked event.
 */
import { test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../worker/og.js', () => ({ handleOgRequest: vi.fn() }));

vi.mock('../../worker/engagement.js', () => ({
    handleViewsRequest: vi.fn(),
    handleGuestbookRequest: vi.fn(),
    jsonResponse: (body, _req, status) => new Response(JSON.stringify(body), { status }),
    corsHeaders: () => ({}),
}));

const { default: worker, hydrateEvent } = await import('../../worker/index.js');

const now = new Date().toISOString();
const pushEvent = {
    type: 'PushEvent',
    repo: { name: 'and3rn3t/homehub' },
    created_at: now,
    payload: { ref: 'refs/heads/main', head: 'abc123', before: '000', push_id: 1 },
};
const prEvent = {
    type: 'PullRequestEvent',
    repo: { name: 'and3rn3t/remote' },
    created_at: now,
    payload: {
        action: 'opened',
        number: 7,
        pull_request: {
            url: 'https://api.github.com/repos/and3rn3t/remote/pulls/7',
            head: { ref: 'feat/x' },
        },
    },
};

/** Route mocked GitHub responses by URL. */
function mockGitHub(routes) {
    return vi.fn(async url => {
        for (const [match, body] of routes) {
            if (String(url).includes(match)) {
                return body instanceof Response ? body : Response.json(body);
            }
        }
        return new Response('not found', { status: 404 });
    });
}

beforeEach(() => {
    globalThis.caches = { default: { match: vi.fn(async () => null), put: vi.fn() } };
});

afterEach(() => {
    vi.unstubAllGlobals();
});

test('GET /activity hydrates the push commit message', async () => {
    const fetchMock = mockGitHub([
        ['/events/public', [structuredClone(pushEvent)]],
        ['/commits/abc123', { sha: 'abc123', commit: { message: 'feat: reconnect\n\nbody' } }],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const res = await worker.fetch(new Request('https://w.dev/activity'), {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ type: 'push', message: 'feat: reconnect', branch: 'main' });
    // 1 events page (short page ends pagination) + 1 commit lookup.
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('GET /activity hydrates the PR title', async () => {
    vi.stubGlobal(
        'fetch',
        mockGitHub([
            ['/events/public', [structuredClone(prEvent)]],
            ['/pulls/7', { title: 'Add volume presets' }],
        ])
    );

    const body = await (await worker.fetch(new Request('https://w.dev/activity'), {})).json();

    expect(body).toMatchObject({ type: 'pr', message: 'Add volume presets', branch: 'feat/x' });
});

test('GET /activity falls back to null message when the lookup fails', async () => {
    vi.stubGlobal(
        'fetch',
        mockGitHub([
            ['/events/public', [structuredClone(pushEvent)]],
            ['/commits/abc123', new Response('boom', { status: 500 })],
        ])
    );

    const res = await worker.fetch(new Request('https://w.dev/activity'), {});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ type: 'push', message: null });
});

test('hydrateEvent leaves events that already carry commits untouched', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const event = structuredClone(pushEvent);
    event.payload.commits = [{ sha: 'abc123', message: 'already here' }];

    await hydrateEvent(event, {});

    expect(fetchMock).not.toHaveBeenCalled();
    expect(event.payload.commits[0].message).toBe('already here');
});

// ── Failure handling ──────────────────────────────────────────────────────────

/** A cache that actually stores what is put into it, keyed by URL. */
function useRealisticCache() {
    const store = new Map();
    const cache = {
        match: vi.fn(async key => store.get(key.url)?.clone() ?? null),
        put: vi.fn(async (key, response) => {
            store.set(key.url, response);
        }),
    };
    globalThis.caches = { default: cache };
    return cache;
}

test('GET /activity returns a generic 502 without upstream details', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
        'fetch',
        mockGitHub([['/events/public', new Response('rate limited', { status: 403 })]])
    );

    const res = await worker.fetch(new Request('https://w.dev/activity'), {});

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream_error' });
});

test('a failed GitHub lookup is remembered, so the next visitor does not hit GitHub', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useRealisticCache();
    const fetchMock = mockGitHub([['/events/public', new Response('boom', { status: 500 })]]);
    vi.stubGlobal('fetch', fetchMock);

    const first = await worker.fetch(new Request('https://w.dev/activity'), {});
    const second = await worker.fetch(new Request('https://w.dev/activity'), {});

    expect(first.status).toBe(502);
    expect(second.status).toBe(502);
    expect(await second.json()).toEqual({ error: 'upstream_error' });
    expect(fetchMock).toHaveBeenCalledTimes(1); // the second request was answered from cache
});

test('the failure is cached for about a minute', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cache = useRealisticCache();
    vi.stubGlobal('fetch', mockGitHub([['/events/public', new Response('x', { status: 500 })]]));

    await worker.fetch(new Request('https://w.dev/activity'), {});

    const [, stored] = cache.put.mock.calls[0];
    expect(stored.headers.get('Cache-Control')).toBe('public, max-age=60');
});

test('"no activity" is cached too, and stays a 404', async () => {
    useRealisticCache();
    const fetchMock = mockGitHub([['/events/public', []]]);
    vi.stubGlobal('fetch', fetchMock);

    const first = await worker.fetch(new Request('https://w.dev/activity'), {});
    const second = await worker.fetch(new Request('https://w.dev/activity'), {});

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(await second.json()).toEqual({ error: 'no_activity' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('a successful lookup is still served from cache with cached:true', async () => {
    useRealisticCache();
    const fetchMock = mockGitHub([
        ['/events/public', [structuredClone(pushEvent)]],
        ['/commits/abc123', { sha: 'abc123', commit: { message: 'feat: x' } }],
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const first = await (await worker.fetch(new Request('https://w.dev/activity'), {})).json();
    const second = await (await worker.fetch(new Request('https://w.dev/activity'), {})).json();

    expect(first.cached).toBe(false);
    expect(second).toMatchObject({ message: 'feat: x', cached: true });
});

test('hydrateEvent logs why a commit lookup failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 404 }))
    );
    const event = structuredClone(pushEvent);

    await hydrateEvent(event, {});

    expect(event.payload.commits).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/commit lookup failed: HTTP 404.*homehub/)
    );
});

test('hydrateEvent logs why a PR lookup failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response('nope', { status: 403 }))
    );

    await hydrateEvent(structuredClone(prEvent), {});

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/PR lookup failed: HTTP 403.*remote/));
});

test('hydrateEvent logs (and survives) a network error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
            throw new Error('connection reset');
        })
    );

    await expect(hydrateEvent(structuredClone(pushEvent), {})).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/hydration threw/), 'connection reset');
});
