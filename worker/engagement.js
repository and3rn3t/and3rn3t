/**
 * Cloudflare Worker — Views & Guestbook handlers
 *
 * KV namespaces (set in wrangler.toml):
 *   VIEWS_KV     — page view counts (key = page slug, value = number string)
 *   GUESTBOOK_KV — one key per guestbook entry (`entry:<inverted timestamp>:<id>`, so a
 *                  plain `list` returns newest first) plus short-lived `rl:<ip>` throttle keys
 *
 * Cloudflare Turnstile (https://developers.cloudflare.com/turnstile/):
 *   TURNSTILE_SECRET — set via `wrangler secret put TURNSTILE_SECRET`. Required: without it
 *   guestbook posts are refused (503) unless ALLOW_UNVERIFIED_GUESTBOOK=1 (local dev only,
 *   put it in .dev.vars).
 *
 * Endpoints:
 *   GET  /views?page=<slug>           → { page, views }   (slug must be in KNOWN_PAGES)
 *   POST /views?page=<slug>           → increments count, returns { page, views }
 *   GET  /guestbook                   → [ ...entries ]  (newest-first, max 50)
 *   POST /guestbook  body: { name, message, token } → validates Turnstile, stores entry
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_GUESTBOOK_ENTRIES = 50;
const MAX_NAME_LENGTH = 60;
const MAX_MESSAGE_LENGTH = 500;

// Only these pages are counted. The slug is never used to create a KV key from user input.
const KNOWN_PAGES = new Set(['home']);

const ENTRY_PREFIX = 'entry:';
const LEGACY_ENTRIES_KEY = 'entries'; // the old single-array storage, migrated on first read
const MAX_TIMESTAMP = 9_999_999_999_999;
const KV_LIST_MAX = 1000;
const THROTTLE_SECONDS = 60; // KV's minimum expirationTtl

const ALLOWED_ORIGINS = new Set(['https://andernet.dev', 'https://and3rn3t.github.io']);
const FALLBACK_ORIGIN = 'https://andernet.dev';

// ── Views ──────────────────────────────────────────────────────────────────

export async function handleViewsRequest(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }

    const page = url.searchParams.get('page') ?? 'home';
    if (!KNOWN_PAGES.has(page)) {
        return jsonResponse({ error: 'unknown_page' }, request, 400);
    }

    if (!env.VIEWS_KV) {
        return jsonResponse({ error: 'kv_unavailable' }, request, 503);
    }

    if (request.method === 'POST') {
        const raw = (await env.VIEWS_KV.get(page)) ?? '0';
        const count = (Number.parseInt(raw, 10) || 0) + 1;
        await env.VIEWS_KV.put(page, String(count));
        return jsonResponse({ page, views: count }, request, 200);
    }

    if (request.method === 'GET') {
        const raw = (await env.VIEWS_KV.get(page)) ?? '0';
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

/**
 * KV lists keys in ascending order, so the timestamp is stored inverted: the newest entry
 * has the smallest number and sorts first.
 */
function entryKey(dateIso, suffix) {
    const parsed = Date.parse(dateIso);
    const timestamp = Number.isFinite(parsed) ? parsed : Date.now();
    const inverted = MAX_TIMESTAMP - Math.min(Math.max(timestamp, 0), MAX_TIMESTAMP);
    return `${ENTRY_PREFIX}${String(inverted).padStart(13, '0')}:${suffix}`;
}

/**
 * Entries used to live in one JSON array under `entries`. Move them to per-entry keys.
 * Keys are deterministic, so a run interrupted before the final delete simply repeats.
 */
async function migrateLegacyEntries(env) {
    const raw = await env.GUESTBOOK_KV.get(LEGACY_ENTRIES_KEY);
    if (raw === null) return;

    let legacy;
    try {
        legacy = JSON.parse(raw);
    } catch {
        legacy = null;
    }
    if (!Array.isArray(legacy)) {
        console.warn('[guestbook] legacy "entries" value is not a JSON array; leaving it in place');
        return;
    }

    await Promise.all(
        legacy
            .filter(entry => entry && typeof entry === 'object')
            .map((entry, index) =>
                env.GUESTBOOK_KV.put(
                    entryKey(entry.date, `legacy-${String(index).padStart(3, '0')}`),
                    JSON.stringify(entry)
                )
            )
    );
    await env.GUESTBOOK_KV.delete(LEGACY_ENTRIES_KEY);
}

async function handleGuestbookGet(request, env) {
    await migrateLegacyEntries(env);
    const { keys } = await env.GUESTBOOK_KV.list({
        prefix: ENTRY_PREFIX,
        limit: MAX_GUESTBOOK_ENTRIES,
    });
    const values = await Promise.all(keys.map(({ name }) => env.GUESTBOOK_KV.get(name)));
    const entries = values.flatMap(raw => {
        try {
            return raw ? [JSON.parse(raw)] : [];
        } catch {
            return []; // skip a value that isn't valid JSON rather than failing the list
        }
    });
    return jsonResponse(entries, request, 200);
}

/** Keep only the newest MAX_GUESTBOOK_ENTRIES entries. */
async function pruneEntries(env) {
    const { keys } = await env.GUESTBOOK_KV.list({ prefix: ENTRY_PREFIX, limit: KV_LIST_MAX });
    await Promise.all(
        keys.slice(MAX_GUESTBOOK_ENTRIES).map(({ name }) => env.GUESTBOOK_KV.delete(name))
    );
}

async function handleGuestbookPost(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'invalid_json' }, request, 400);
    }
    const input = body && typeof body === 'object' ? body : {};

    const name = String(input.name ?? '')
        .trim()
        .slice(0, MAX_NAME_LENGTH);
    const message = String(input.message ?? '')
        .trim()
        .slice(0, MAX_MESSAGE_LENGTH);
    const token = String(input.token ?? '');

    if (!name || !message) {
        return jsonResponse({ error: 'missing_fields' }, request, 400);
    }

    // Fail closed: a missing secret must not silently turn the captcha off in production.
    if (!env.TURNSTILE_SECRET && env.ALLOW_UNVERIFIED_GUESTBOOK !== '1') {
        return jsonResponse({ error: 'captcha_unconfigured' }, request, 503);
    }

    // One post per IP per minute. Checked before the captcha so a flood can't make us call
    // siteverify for every request. Cloudflare always sets this header in production.
    const ip = request.headers.get('CF-Connecting-IP');
    const throttleKey = ip ? `rl:${ip}` : null;
    if (throttleKey && (await env.GUESTBOOK_KV.get(throttleKey)) !== null) {
        const res = jsonResponse({ error: 'rate_limited' }, request, 429);
        res.headers.set('Retry-After', String(THROTTLE_SECONDS));
        return res;
    }

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

    // One key per entry: concurrent signatures can't overwrite each other.
    await env.GUESTBOOK_KV.put(
        entryKey(entry.date, crypto.randomUUID().slice(0, 8)),
        JSON.stringify(entry)
    );
    if (throttleKey) {
        await env.GUESTBOOK_KV.put(throttleKey, '1', { expirationTtl: THROTTLE_SECONDS });
    }
    await pruneEntries(env);

    return jsonResponse({ ok: true, entry }, request, 201);
}

async function verifyTurnstile(token, secret, request) {
    const ip = request.headers.get('CF-Connecting-IP') ?? '';
    const form = new FormData();
    form.append('secret', secret);
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

/** Exact match on the parsed origin: "http://localhost.evil.com" must not pass as localhost. */
function isLocalOrigin(origin) {
    try {
        const { protocol, hostname } = new URL(origin);
        return protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1');
    } catch {
        return false;
    }
}

export function corsHeaders(request) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = ALLOWED_ORIGINS.has(origin) || isLocalOrigin(origin);
    return {
        'Access-Control-Allow-Origin': allowed ? origin : FALLBACK_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}
