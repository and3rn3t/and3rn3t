/**
 * Cloudflare Worker — and3rn3t portfolio backend
 *
 * GET /activity
 *   Returns the most recent meaningful GitHub activity as a small JSON object.
 *   Results are cached at the CF edge for 5 minutes so the GitHub API is never
 *   hit on every visitor page-load.
 *
 * Response schema:
 *   {
 *     "repo":      "and3rn3t/homehub",
 *     "repoName":  "homehub",
 *     "repoUrl":   "https://github.com/and3rn3t/homehub",
 *     "type":      "push",          // push | create | pr | release | star
 *     "message":   "feat: add WebSocket reconnect logic",
 *     "branch":    "main",
 *     "pushedAt":  "2026-06-13T21:49:00Z",
 *     "cached":    true
 *   }
 *
 * Secrets / env vars (set via `wrangler secret put`):
 *   GH_TOKEN — fine-grained PAT, public repositories read-only, no extra permissions (boosts rate limit to 5000/h)
 *
 * Workers-compatible: uses only standard fetch + Response; no Node built-ins.
 */

import { pickEvent, buildActivity } from '../modules/utils/activity.js';
import {
    handleViewsRequest,
    handleGuestbookRequest,
    jsonResponse,
    corsHeaders,
} from './engagement.js';

const GITHUB_USERNAME = 'and3rn3t';
const CACHE_TTL_SECONDS = 300; // 5 min edge cache
const NEGATIVE_TTL_SECONDS = 60; // remember a failed lookup briefly so GitHub isn't hammered

export default {
    async fetch(request, env) {
        // Any unexpected failure becomes a JSON 500 that still carries CORS headers; a bare
        // runtime 500 has none, and the browser then reports a misleading CORS error.
        try {
            return await route(request, env);
        } catch (err) {
            console.error('[worker] unhandled error:', err?.stack ?? err);
            return jsonResponse({ error: 'internal' }, request, 500);
        }
    },
};

async function route(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
        return new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (url.pathname === '/views') {
        return handleViewsRequest(request, env);
    }

    if (url.pathname === '/guestbook') {
        return handleGuestbookRequest(request, env);
    }

    if (url.pathname !== '/activity') {
        return new Response('Not found', { status: 404 });
    }

    // CORS pre-flight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }

    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }

    // Try the CF cache first.
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.internal/activity/${GITHUB_USERNAME}`, request);
    const cached = await cache.match(cacheKey);
    if (cached) {
        const data = await cached.json();
        if (data.__negative) {
            return jsonResponse({ error: data.__negative.error }, request, data.__negative.status);
        }
        return jsonResponse({ ...data, cached: true }, request, 200);
    }

    // Fetch from GitHub.
    const ghHeaders = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'and3rn3t-portfolio-worker/1.0',
    };
    if (env.GH_TOKEN) {
        ghHeaders['Authorization'] = `Bearer ${env.GH_TOKEN}`;
    }

    let events;
    try {
        // Fetch up to 3 pages (90 events) so portfolio-repo noise doesn't
        // crowd out activity from other repos.
        const pages = [];
        for (let page = 1; page <= 3; page++) {
            const resp = await fetch(
                `https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=30&page=${page}`,
                { headers: ghHeaders }
            );
            if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
            const chunk = await resp.json();
            pages.push(...chunk);
            if (chunk.length < 30) break; // no more pages
        }
        events = pages;
    } catch (err) {
        // The detail stays in the logs; clients only get a generic error.
        console.warn('[activity] GitHub events request failed:', err.message);
        await cacheFailure(cache, cacheKey, 'upstream_error', 502);
        return jsonResponse({ error: 'upstream_error' }, request, 502);
    }

    const event = pickEvent(events);
    if (!event) {
        await cacheFailure(cache, cacheKey, 'no_activity', 404);
        return jsonResponse({ error: 'no_activity' }, request, 404);
    }
    await hydrateEvent(event, ghHeaders);
    const activity = buildActivity(event, event.repo?.name ?? '');

    // Store in CF cache (honour CF Cache rules: only GET, 200 responses).
    const responseToCache = new Response(JSON.stringify(activity), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}`,
        },
    });
    await cache.put(cacheKey, responseToCache.clone());

    return jsonResponse({ ...activity, cached: false }, request, 200);
}

/**
 * Remember a failed lookup for a minute. Cached as a 200 (the Cache API only stores
 * successful responses) with a marker the cache-hit path above turns back into the error.
 */
async function cacheFailure(cache, cacheKey, error, status) {
    await cache.put(
        cacheKey,
        new Response(JSON.stringify({ __negative: { error, status } }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': `public, max-age=${NEGATIVE_TTL_SECONDS}`,
            },
        })
    );
}

/**
 * GitHub's events API no longer includes commit lists in PushEvent payloads or
 * titles in PullRequestEvent payloads. Fill them back in with one API call when
 * absent. Mutates `event`; failures leave it untouched (buildActivity falls back)
 * and are logged, so a message that stays null can be traced with `wrangler tail`.
 */
export async function hydrateEvent(event, headers) {
    const payload = event.payload;
    if (!payload) return;
    const repo = event.repo?.name;
    try {
        if (event.type === 'PushEvent' && !payload.commits?.length && payload.head) {
            const resp = await fetch(
                `https://api.github.com/repos/${repo}/commits/${payload.head}`,
                { headers }
            );
            if (!resp.ok) {
                console.warn(`[activity] commit lookup failed: HTTP ${resp.status} (${repo})`);
                return;
            }
            const commit = await resp.json();
            payload.commits = [{ sha: commit.sha, message: commit.commit?.message ?? '' }];
        } else if (
            event.type === 'PullRequestEvent' &&
            payload.pull_request?.url &&
            !payload.pull_request.title
        ) {
            const resp = await fetch(payload.pull_request.url, { headers });
            if (!resp.ok) {
                console.warn(`[activity] PR lookup failed: HTTP ${resp.status} (${repo})`);
                return;
            }
            const pr = await resp.json();
            payload.pull_request.title = pr.title;
        }
    } catch (err) {
        // Best effort — keep the generic fallback text, but leave a trace.
        console.warn(`[activity] hydration threw (${repo}):`, err?.message ?? err);
    }
}
