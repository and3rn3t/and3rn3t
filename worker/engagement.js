/**
 * Cloudflare Worker — Views & Guestbook handlers
 *
 * KV namespaces (set in wrangler.toml):
 *   VIEWS_KV     — stores page view counts (key = page slug, value = number string)
 *   GUESTBOOK_KV — stores guestbook entries (key = timestamp ISO, value = JSON entry)
 *
 * Cloudflare Turnstile (https://developers.cloudflare.com/turnstile/):
 *   TURNSTILE_SECRET — set via `wrangler secret put TURNSTILE_SECRET`
 *
 * Endpoints:
 *   GET  /views?page=<slug>           → { page, views }
 *   POST /views?page=<slug>           → increments count, returns { page, views }
 *   GET  /guestbook                   → [ ...entries ]  (newest-first, max 50)
 *   POST /guestbook  body: { name, message, token } → validates Turnstile, stores entry
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_GUESTBOOK_ENTRIES = 50;
const MAX_NAME_LENGTH = 60;
const MAX_MESSAGE_LENGTH = 500;

// ── Views ──────────────────────────────────────────────────────────────────

export async function handleViewsRequest(request, env) {
    const url  = new URL(request.url);
    const page = (url.searchParams.get('page') ?? 'home').slice(0, 60).replace(/[^a-z0-9-_]/gi, '');

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }

    if (!env.VIEWS_KV) {
        return jsonResponse({ error: 'kv_unavailable' }, request, 503);
    }

    if (request.method === 'POST') {
        const raw   = (await env.VIEWS_KV.get(page)) ?? '0';
        const count = (Number.parseInt(raw, 10) || 0) + 1;
        await env.VIEWS_KV.put(page, String(count));
        return jsonResponse({ page, views: count }, request, 200);
    }

    if (request.method === 'GET') {
        const raw   = (await env.VIEWS_KV.get(page)) ?? '0';
        const count = Number.parseInt(raw, 10) || 0;
        return jsonResponse({ page, views: count }, request, 200);
    }

    return new Response('Method not allowed', { status: 405 });
}

// ── Guestbook ──────────────────────────────────────────────────────────────

export async function handleGuestbookRequest(request, env) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }

    if (!env.GUESTBOOK_KV) {
        return jsonResponse({ error: 'kv_unavailable' }, request, 503);
    }

    if (request.method === 'GET') {
        return handleGuestbookGet(request, env);
    }

    if (request.method === 'POST') {
        return handleGuestbookPost(request, env);
    }

    return new Response('Method not allowed', { status: 405 });
}

async function handleGuestbookGet(request, env) {
    const raw     = (await env.GUESTBOOK_KV.get('entries')) ?? '[]';
    const entries = JSON.parse(raw);
    return jsonResponse(entries.slice(0, MAX_GUESTBOOK_ENTRIES), request, 200);
}

async function handleGuestbookPost(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'invalid_json' }, request, 400);
    }

    const name    = String(body.name    ?? '').trim().slice(0, MAX_NAME_LENGTH);
    const message = String(body.message ?? '').trim().slice(0, MAX_MESSAGE_LENGTH);
    const token   = String(body.token   ?? '');

    if (!name || !message) {
        return jsonResponse({ error: 'missing_fields' }, request, 400);
    }

    // Validate Turnstile token (skip in dev if no secret set).
    if (env.TURNSTILE_SECRET) {
        const valid = await verifyTurnstile(token, env.TURNSTILE_SECRET, request);
        if (!valid) {
            return jsonResponse({ error: 'invalid_captcha' }, request, 403);
        }
    }

    const entry = {
        name,
        message,
        date: new Date().toISOString(),
    };

    // Prepend to the list stored in KV (list stays newest-first).
    const raw     = (await env.GUESTBOOK_KV.get('entries')) ?? '[]';
    const entries = JSON.parse(raw);
    entries.unshift(entry);
    const trimmed = entries.slice(0, MAX_GUESTBOOK_ENTRIES);
    await env.GUESTBOOK_KV.put('entries', JSON.stringify(trimmed));

    return jsonResponse({ ok: true, entry }, request, 201);
}

async function verifyTurnstile(token, secret, request) {
    const ip   = request.headers.get('CF-Connecting-IP') ?? '';
    const form = new FormData();
    form.append('secret',   secret);
    form.append('response', token);
    form.append('remoteip', ip);
    try {
        const resp = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
        const data = await resp.json();
        return data.success === true;
    } catch {
        return false;
    }
}

// ── Shared helpers (re-exported so index.js can use them) ──────────────────

export function jsonResponse(data, request, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request),
        },
    });
}

export function corsHeaders(request) {
    const origin  = request.headers.get('Origin') ?? '';
    const allowed = origin === 'https://andernet.dev'
        || origin === 'https://and3rn3t.github.io'
        || origin.startsWith('http://localhost');
    return {
        'Access-Control-Allow-Origin':  allowed ? origin : 'https://andernet.dev',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age':       '86400',
        'Vary': 'Origin',
    };
}
