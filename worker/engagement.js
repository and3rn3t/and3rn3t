/**
 * Cloudflare Worker — Views & Guestbook handlers
 *
 * KV namespaces (set in wrangler.toml):
 *   COUNTER      — the Durable Object that counts page views (counter.js), where the count lives
 *   VIEWS_KV     — the cron's `snapshot:*` keys (snapshot.js), the view count as it was before
 *                  COUNTER (it seeds the counter, then mirrors every 10th count), and the local-dev
 *                  fallback (key = page slug, value = number string)
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

import { jsonResponse, methodNotAllowed, preflight } from './http.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_GUESTBOOK_ENTRIES = 50;
const MAX_NAME_LENGTH = 60;
const MAX_MESSAGE_LENGTH = 500;

// Only these pages are counted. The slug is never used to create a KV key from user input.
const KNOWN_PAGES = new Set(['home']);

const ENTRY_PREFIX = 'entry:';
const MAX_TIMESTAMP = 9_999_999_999_999;
const KV_LIST_MAX = 1000;
const THROTTLE_SECONDS = 60; // KV's minimum expirationTtl

// ── Views ──────────────────────────────────────────────────────────────────

export async function handleViewsRequest(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
        return preflight(request);
    }

    const page = url.searchParams.get('page') ?? 'home';
    if (!KNOWN_PAGES.has(page)) {
        return jsonResponse({ error: 'unknown_page' }, request, 400);
    }

    if (request.method !== 'POST' && request.method !== 'GET') {
        return methodNotAllowed(request, 'GET, POST, OPTIONS');
    }

    // The Durable Object counts atomically. Without its binding (local dev) the old KV path
    // is used: it can lose a count under overlap, which does not matter on one machine.
    if (env.COUNTER) {
        try {
            const counter = env.COUNTER.get(env.COUNTER.idFromName('views'));
            const views =
                request.method === 'POST'
                    ? await counter.increment(page)
                    : await counter.read(page);
            return jsonResponse({ page, views }, request, 200);
        } catch (err) {
            console.warn('[views] counter unavailable:', err?.message ?? err);
            return jsonResponse({ error: 'counter_unavailable' }, request, 503);
        }
    }

    if (!env.VIEWS_KV) {
        return jsonResponse({ error: 'kv_unavailable' }, request, 503);
    }
    const stored = Number.parseInt((await env.VIEWS_KV.get(page)) ?? '0', 10) || 0;
    if (request.method === 'GET') return jsonResponse({ page, views: stored }, request, 200);
    await env.VIEWS_KV.put(page, String(stored + 1));
    return jsonResponse({ page, views: stored + 1 }, request, 200);
}

// ── Guestbook ──────────────────────────────────────────────────────────────

export async function handleGuestbookRequest(request, env) {
    if (request.method === 'OPTIONS') {
        return preflight(request);
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

    return methodNotAllowed(request, 'GET, POST, OPTIONS');
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

async function readStoredEntries(env) {
    const { keys } = await env.GUESTBOOK_KV.list({
        prefix: ENTRY_PREFIX,
        limit: MAX_GUESTBOOK_ENTRIES,
    });
    const values = await Promise.all(keys.map(({ name }) => env.GUESTBOOK_KV.get(name)));
    return values.flatMap(raw => {
        try {
            return raw ? [JSON.parse(raw)] : [];
        } catch {
            return []; // skip a value that isn't valid JSON rather than failing the list
        }
    });
}

async function handleGuestbookGet(request, env) {
    return jsonResponse(await readStoredEntries(env), request, 200);
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

    // A hard cap first, per address: the KV throttle below is best-effort (no atomic
    // increment), so a burst could get past it and each pass costs a siteverify call. The
    // binding is approximate and per location, but it is counted before anything else runs.
    // Absent in local dev and tests, where requests pass.
    if (env.GUESTBOOK_LIMITER) {
        const key = `guestbook:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
        const { success } = await env.GUESTBOOK_LIMITER.limit({ key });
        if (!success) {
            const res = jsonResponse({ error: 'rate_limited' }, request, 429);
            res.headers.set('Retry-After', String(THROTTLE_SECONDS));
            return res;
        }
    }

    // One attempt per IP per minute. Every attempt that gets this far counts, including ones
    // whose captcha then fails, and the marker is written *before* the captcha is verified,
    // so a flood of bad tokens can't make us call siteverify for each request. Cloudflare
    // always sets CF-Connecting-IP in production. KV has no atomic increment, so requests
    // that overlap within a moment can still slip through: this is best-effort, and a hard
    // limit would need a Durable Object or the Workers Rate Limiting binding.
    const ip = request.headers.get('CF-Connecting-IP');
    const throttleKey = ip ? `rl:${ip}` : null;
    if (throttleKey) {
        if ((await env.GUESTBOOK_KV.get(throttleKey)) !== null) {
            const res = jsonResponse({ error: 'rate_limited' }, request, 429);
            res.headers.set('Retry-After', String(THROTTLE_SECONDS));
            return res;
        }
        await env.GUESTBOOK_KV.put(throttleKey, '1', { expirationTtl: THROTTLE_SECONDS });
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

    // Cleanup is best-effort: the entry is already saved, and reporting an error now would
    // make the client treat a successful post as failed and invite a duplicate.
    try {
        await pruneEntries(env);
    } catch (err) {
        console.warn('[guestbook] pruning failed (the entry was saved):', err?.message ?? err);
    }

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
