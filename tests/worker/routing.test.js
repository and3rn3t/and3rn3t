/**
 * Worker routing tests — exercises worker/index.js without deploying.
 *
 * og.js and engagement.js are mocked to avoid their network calls.
 */
import { test, expect, vi } from 'vitest';

vi.mock('../../worker/og.js', () => ({
    handleOgRequest: vi.fn().mockResolvedValue(
        new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml' } })
    ),
}));

vi.mock('../../worker/engagement.js', () => ({
    handleViewsRequest:    vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    handleGuestbookRequest: vi.fn().mockResolvedValue(new Response('[]', { status: 200 })),
    jsonResponse:  (body, _req, status) => new Response(JSON.stringify(body), { status }),
    corsHeaders:   () => ({ 'Access-Control-Allow-Origin': '*' }),
}));

const { default: worker } = await import('../../worker/index.js');
const env = {};

function req(method, path) {
    return new Request(`https://w.dev${path}`, { method });
}

// ── /health ───────────────────────────────────────────────────────────────────

test('GET /health returns 200 with ok:true', async () => {
    const res  = await worker.fetch(req('GET', '/health'), env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
});

// ── Unknown routes ────────────────────────────────────────────────────────────

test('GET /unknown returns 404', async () => {
    const res = await worker.fetch(req('GET', '/unknown'), env);
    expect(res.status).toBe(404);
});

// ── /og ───────────────────────────────────────────────────────────────────────

test('GET /og delegates to handleOgRequest', async () => {
    const res = await worker.fetch(req('GET', '/og'), env);
    expect(res.headers.get('Content-Type')).toMatch(/svg/);
});

// ── /views ────────────────────────────────────────────────────────────────────

test('GET /views delegates to handleViewsRequest', async () => {
    const res = await worker.fetch(req('GET', '/views?page=home'), env);
    expect(res.status).toBe(200);
});

// ── /activity — non-GET ───────────────────────────────────────────────────────

test('POST /activity returns 405', async () => {
    const res = await worker.fetch(req('POST', '/activity'), env);
    expect(res.status).toBe(405);
});

// ── /activity CORS preflight ──────────────────────────────────────────────────

test('OPTIONS /activity returns 200 with CORS headers', async () => {
    const res = await worker.fetch(req('OPTIONS', '/activity'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeDefined();
});
