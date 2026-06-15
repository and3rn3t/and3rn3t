/**
 * Worker engagement handler tests (Node environment).
 *
 * Node 18+ provides global Request/Response/URL/fetch, so no polyfills needed.
 * KV namespaces are mocked with a simple Map wrapper.
 */
import { test, expect, vi } from 'vitest';
import {
    handleViewsRequest,
    handleGuestbookRequest,
    jsonResponse,
    corsHeaders,
} from '../../worker/engagement.js';

// ── KV mock ──────────────────────────────────────────────────────────────────

function makeKV() {
    const store = new Map();
    return {
        get: k => Promise.resolve(store.get(k) ?? null),
        put: (k, v) => {
            store.set(k, v);
            return Promise.resolve();
        },
        delete: k => {
            store.delete(k);
            return Promise.resolve();
        },
        list: () => Promise.resolve({ keys: [...store.keys()].map(name => ({ name })) }),
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
    await env.VIEWS_KV.put('blog', '17');
    const req = makeRequest('GET', 'https://w.dev/views?page=blog');
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

test('POST /views sanitises the page slug', async () => {
    const env = { VIEWS_KV: makeKV() };
    const req = makeRequest('POST', 'https://w.dev/views?page=../../../etc/passwd');
    const res = await handleViewsRequest(req, env);
    const body = await res.json();
    // Sanitised: only [a-z0-9-_] allowed; slashes stripped
    expect(body.page).not.toContain('/');
    expect(body.page).not.toContain('.');
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
