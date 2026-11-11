/**
 * Worker engagement handler tests (Node environment).
 *
 * Node 18+ provides global Request/Response/URL/fetch, so no polyfills needed.
 * KV namespaces are mocked with a simple Map wrapper.
 */
import { test, expect, vi, afterEach } from 'vitest';
import {
    handleViewsRequest,
    handleGuestbookRequest,
    jsonResponse,
    corsHeaders,
} from '../../worker/engagement.js';

// ── KV mock ──────────────────────────────────────────────────────────────────

function makeKV() {
    const store = new Map();
    const putOptions = new Map();
    return {
        store,
        putOptions,
        get: k => Promise.resolve(store.get(k) ?? null),
        put: (k, v, options) => {
            store.set(k, v);
            if (options) putOptions.set(k, options);
            return Promise.resolve();
        },
        delete: k => {
            store.delete(k);
            return Promise.resolve();
        },
        // Like Workers KV: filtered by prefix, ascending key order, capped by limit.
        list: ({ prefix = '', limit = 1000 } = {}) =>
            Promise.resolve({
                keys: [...store.keys()]
                    .filter(name => name.startsWith(prefix))
                    .sort()
                    .slice(0, limit)
                    .map(name => ({ name })),
            }),
    };
}

function makeRequest(method, url, body) {
    return new Request(url, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: body ? { 'Content-Type': 'application/json' } : {},
    });
}

// ── jsonResponse / corsHeaders ────────────────────────────────────────────────

test('jsonResponse sets Content-Type to application/json', async () => {
    const req = makeRequest('GET', 'https://w.dev/views?page=home');
    const res = jsonResponse({ ok: true }, req, 200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.status).toBe(200);
});

test('corsHeaders includes Access-Control-Allow-Origin', () => {
    const req = makeRequest('OPTIONS', 'https://w.dev/views');
    const h = corsHeaders(req);
    expect(h['Access-Control-Allow-Origin']).toBeDefined();
});

// ── /views GET ────────────────────────────────────────────────────────────────

test('GET /views returns 0 when no entry in KV', async () => {
    const env = { VIEWS_KV: makeKV() };
    const req = makeRequest('GET', 'https://w.dev/views?page=home');
    const res = await handleViewsRequest(req, env);
    const body = await res.json();
    expect(body.views).toBe(0);
    expect(body.page).toBe('home');
});

test('GET /views returns stored count', async () => {
    const env = { VIEWS_KV: makeKV() };
    await env.VIEWS_KV.put('home', '17');
    const req = makeRequest('GET', 'https://w.dev/views?page=home');
    const res = await handleViewsRequest(req, env);
    const body = await res.json();
    expect(body.views).toBe(17);
});

// ── /views POST ───────────────────────────────────────────────────────────────

test('POST /views increments count from 0 → 1', async () => {
    const env = { VIEWS_KV: makeKV() };
    const req = makeRequest('POST', 'https://w.dev/views?page=home');
    const res = await handleViewsRequest(req, env);
    const body = await res.json();
    expect(body.views).toBe(1);
});

test('POST /views increments existing count', async () => {
    const env = { VIEWS_KV: makeKV() };
    await env.VIEWS_KV.put('home', '5');
    const req = makeRequest('POST', 'https://w.dev/views?page=home');
    const res = await handleViewsRequest(req, env);
    expect((await res.json()).views).toBe(6);
});

test.each(['!!!', '', '../../../etc/passwd', 'blog', 'x'.repeat(200)])(
    'POST /views rejects unknown page %j and writes nothing',
    async page => {
        const env = { VIEWS_KV: makeKV() };
        const url = `https://w.dev/views?page=${encodeURIComponent(page)}`;
        const res = await handleViewsRequest(makeRequest('POST', url), env);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('unknown_page');
        expect(env.VIEWS_KV.store.size).toBe(0);
    }
);

test('GET /views rejects an unknown page too', async () => {
    const env = { VIEWS_KV: makeKV() };
    const res = await handleViewsRequest(makeRequest('GET', 'https://w.dev/views?page=!!!'), env);
    expect(res.status).toBe(400);
});

test('/views defaults to the home page when no page is given', async () => {
    const env = { VIEWS_KV: makeKV() };
    const res = await handleViewsRequest(makeRequest('POST', 'https://w.dev/views'), env);
    expect((await res.json()).page).toBe('home');
});

// ── /views — no KV ────────────────────────────────────────────────────────────

test('GET /views returns 503 when VIEWS_KV is undefined', async () => {
    const req = makeRequest('GET', 'https://w.dev/views?page=home');
    const res = await handleViewsRequest(req, {});
    expect(res.status).toBe(503);
});

// ── /guestbook GET ────────────────────────────────────────────────────────────

test('GET /guestbook returns empty array when no entries', async () => {
    const env = { GUESTBOOK_KV: makeKV() };
    const req = makeRequest('GET', 'https://w.dev/guestbook');
    const res = await handleGuestbookRequest(req, env);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
});

test('GET /guestbook returns stored entries in order', async () => {
    const env = { GUESTBOOK_KV: makeKV() };
    // The handler stores a JSON array under the single 'entries' key.
    const entries = [
        { name: 'Bob', message: 'Hey', date: '2026-06-13T12:00:00Z' },
        { name: 'Alice', message: 'Hi', date: '2026-06-01T00:00:00Z' },
    ];
    await env.GUESTBOOK_KV.put('entries', JSON.stringify(entries));
    const req = makeRequest('GET', 'https://w.dev/guestbook');
    const res = await handleGuestbookRequest(req, env);
    const body = await res.json();
    expect(body[0].name).toBe('Bob');
    expect(body[1].name).toBe('Alice');
});

// ── /guestbook POST — validation ──────────────────────────────────────────────

test('POST /guestbook without a Turnstile token returns 403 (captcha failure)', async () => {
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 'secret' };
    // fetch for Turnstile verify returns success:false (or throws) → 403
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false }),
    });
    const req = new Request('https://w.dev/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', message: 'Hello' }), // no token
    });
    const res = await handleGuestbookRequest(req, env);
    expect(res.status).toBe(403);
});

test('POST /guestbook truncates name longer than 60 chars (does not reject)', async () => {
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 'secret' };
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
    });
    const longName = 'A'.repeat(80);
    const req = new Request('https://w.dev/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: longName, message: 'Hi', token: 'fake-token' }),
    });
    const res = await handleGuestbookRequest(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.entry.name.length).toBeLessThanOrEqual(60);
});

test('POST /guestbook with valid payload stores and returns 201 with entry', async () => {
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 'secret' };
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
    });
    const req = new Request('https://w.dev/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', message: 'Love the site!', token: 'ok' }),
    });
    const res = await handleGuestbookRequest(req, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    // Response shape: { ok: true, entry: { name, message, date } }
    expect(body.ok).toBe(true);
    expect(body.entry.name).toBe('Alice');
    expect(body.entry.message).toBe('Love the site!');
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// ── CORS allowlist ────────────────────────────────────────────────────────────

function corsFor(origin) {
    const req = new Request('https://w.dev/views', { headers: { Origin: origin } });
    return corsHeaders(req)['Access-Control-Allow-Origin'];
}

test.each([
    'https://andernet.dev',
    'https://and3rn3t.github.io',
    'http://localhost:3000',
    'http://localhost',
    'http://127.0.0.1:5173',
])('CORS reflects the allowed origin %s', origin => {
    expect(corsFor(origin)).toBe(origin);
});

test.each([
    'http://localhost.evil.com',
    'http://localhost:80@evil.com',
    'https://localhost',
    'https://andernet.dev.evil.com',
    'http://evil.com',
    'null',
    '',
])('CORS does not reflect %j', origin => {
    expect(corsFor(origin)).toBe('https://andernet.dev');
});

// ── /guestbook POST — captcha configuration and throttle ──────────────────────

function post(body, headers = {}) {
    return new Request('https://w.dev/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

// A fresh Response per call: a body can only be read once.
const turnstileSays = success => vi.fn(async () => Response.json({ success }));

const entryKeys = env => [...env.GUESTBOOK_KV.store.keys()].filter(k => k.startsWith('entry:'));

test('POST /guestbook fails closed (503) when TURNSTILE_SECRET is missing', async () => {
    const env = { GUESTBOOK_KV: makeKV() };
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const res = await handleGuestbookRequest(post({ name: 'A', message: 'B', token: 't' }), env);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('captcha_unconfigured');
    expect(entryKeys(env)).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
});

test('POST /guestbook skips the captcha only with ALLOW_UNVERIFIED_GUESTBOOK=1', async () => {
    const env = { GUESTBOOK_KV: makeKV(), ALLOW_UNVERIFIED_GUESTBOOK: '1' };
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const res = await handleGuestbookRequest(post({ name: 'Dev', message: 'local' }), env);
    expect(res.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
});

test.each([['null'], ['"a string"'], ['[1,2]'], ['{}']])(
    'POST /guestbook answers 400 (not 500) for the JSON body %s',
    async raw => {
        const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
        const res = await handleGuestbookRequest(post(raw), env);
        expect(res.status).toBe(400);
    }
);

test('POST /guestbook allows one post per IP per minute, then answers 429', async () => {
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    globalThis.fetch = turnstileSays(true);
    const send = ip =>
        handleGuestbookRequest(
            post({ name: 'A', message: 'B', token: 't' }, { 'CF-Connecting-IP': ip }),
            env
        );

    expect((await send('203.0.113.7')).status).toBe(201);
    const limited = await send('203.0.113.7');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect((await send('198.51.100.9')).status).toBe(201); // a different visitor is unaffected
    expect(env.GUESTBOOK_KV.putOptions.get('rl:203.0.113.7')).toEqual({ expirationTtl: 60 });
});

test('a throttled request never reaches the Turnstile verification', async () => {
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    await env.GUESTBOOK_KV.put('rl:203.0.113.7', '1');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const res = await handleGuestbookRequest(
        post({ name: 'A', message: 'B', token: 't' }, { 'CF-Connecting-IP': '203.0.113.7' }),
        env
    );
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
});

test('a failed captcha does not start the throttle window', async () => {
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    globalThis.fetch = turnstileSays(false);
    const res = await handleGuestbookRequest(
        post({ name: 'A', message: 'B', token: 'bad' }, { 'CF-Connecting-IP': '203.0.113.7' }),
        env
    );
    expect(res.status).toBe(403);
    expect(env.GUESTBOOK_KV.store.has('rl:203.0.113.7')).toBe(false);
});

// ── /guestbook storage: one key per entry ─────────────────────────────────────

async function sign(env, name, at) {
    vi.setSystemTime(new Date(at));
    const res = await handleGuestbookRequest(
        post({ name, message: `from ${name}`, token: 't' }),
        env
    );
    expect(res.status).toBe(201);
}

const list = async env =>
    (
        await (
            await handleGuestbookRequest(makeRequest('GET', 'https://w.dev/guestbook'), env)
        ).json()
    ).map(e => e.name);

test('guestbook entries are stored one key each and listed newest first', async () => {
    vi.useFakeTimers();
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    globalThis.fetch = turnstileSays(true);

    await sign(env, 'first', '2026-06-01T00:00:00Z');
    await sign(env, 'second', '2026-06-02T00:00:00Z');
    await sign(env, 'third', '2026-06-03T00:00:00Z');

    expect(entryKeys(env)).toHaveLength(3);
    expect(await list(env)).toEqual(['third', 'second', 'first']);
});

test('two signatures at the same instant both survive', async () => {
    vi.useFakeTimers();
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    globalThis.fetch = turnstileSays(true);

    await Promise.all([
        sign(env, 'alice', '2026-06-01T00:00:00Z'),
        sign(env, 'bob', '2026-06-01T00:00:00Z'),
    ]);

    expect((await list(env)).sort()).toEqual(['alice', 'bob']);
});

test('only the newest 50 entries are kept', async () => {
    vi.useFakeTimers();
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    globalThis.fetch = turnstileSays(true);

    for (let day = 0; day < 55; day++) {
        await sign(env, `n${day}`, new Date(Date.UTC(2026, 0, 1 + day)).toISOString());
    }

    const names = await list(env);
    expect(names).toHaveLength(50);
    expect(names[0]).toBe('n54'); // newest first
    expect(names).not.toContain('n0'); // oldest were pruned
    expect(names).toContain('n5');
    expect(entryKeys(env)).toHaveLength(50);
});

test('GET /guestbook skips a stored value that is not valid JSON', async () => {
    const env = { GUESTBOOK_KV: makeKV() };
    await env.GUESTBOOK_KV.put(
        'entry:8000000000000:ok',
        JSON.stringify({ name: 'ok', message: 'm' })
    );
    await env.GUESTBOOK_KV.put('entry:8000000000001:bad', 'not json');
    expect(await list(env)).toEqual(['ok']);
});

// ── /guestbook migration from the old single-array storage ────────────────────

const legacyEntries = [
    { name: 'Bob', message: 'Hey', date: '2026-06-13T12:00:00Z' },
    { name: 'Alice', message: 'Hi', date: '2026-06-01T00:00:00Z' },
];

test('legacy "entries" array is migrated to per-entry keys on first read', async () => {
    const env = { GUESTBOOK_KV: makeKV() };
    await env.GUESTBOOK_KV.put('entries', JSON.stringify(legacyEntries));

    expect(await list(env)).toEqual(['Bob', 'Alice']);
    expect(env.GUESTBOOK_KV.store.has('entries')).toBe(false);
    expect(entryKeys(env)).toHaveLength(2);
    expect(await list(env)).toEqual(['Bob', 'Alice']); // reading again changes nothing
    expect(entryKeys(env)).toHaveLength(2);
});

test('migrated entries interleave correctly with new signatures', async () => {
    vi.useFakeTimers();
    const env = { GUESTBOOK_KV: makeKV(), TURNSTILE_SECRET: 's' };
    globalThis.fetch = turnstileSays(true);
    await env.GUESTBOOK_KV.put('entries', JSON.stringify(legacyEntries));

    await sign(env, 'newcomer', '2026-07-01T00:00:00Z');
    expect(await list(env)).toEqual(['newcomer', 'Bob', 'Alice']);
});

test('a migration interrupted before the delete is safely repeated', async () => {
    const env = { GUESTBOOK_KV: makeKV() };
    await env.GUESTBOOK_KV.put('entries', JSON.stringify(legacyEntries));
    await list(env);
    await env.GUESTBOOK_KV.put('entries', JSON.stringify(legacyEntries)); // as if delete had failed

    expect(await list(env)).toEqual(['Bob', 'Alice']); // no duplicates
    expect(entryKeys(env)).toHaveLength(2);
});

test('a corrupt legacy value is left in place and does not break the guestbook', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const env = { GUESTBOOK_KV: makeKV() };
    await env.GUESTBOOK_KV.put('entries', '{not json');
    await env.GUESTBOOK_KV.put(
        'entry:8000000000000:ok',
        JSON.stringify({ name: 'ok', message: 'm' })
    );

    expect(await list(env)).toEqual(['ok']);
    expect(env.GUESTBOOK_KV.store.get('entries')).toBe('{not json');
    expect(warn).toHaveBeenCalled();
});
