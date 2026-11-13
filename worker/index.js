/**
 * Cloudflare Worker — and3rn3t portfolio backend
 *
 * Also: /views and /guestbook (engagement.js), /mcp (the MCP server, mcp.js) and the
 * discovery documents under /.well-known/ and /api/openapi.json (discovery.js).
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
 *   GH_TOKEN — a fine-grained PAT with read:user scope (boosts rate limit to 5000/h)
 *
 * Workers-compatible: uses only standard fetch + Response; no Node built-ins.
 */

import { pickEvent, buildActivity } from '../modules/utils/activity.js';
import { discoveryResponse } from './discovery.js';
import {
    handleViewsRequest,
    handleGuestbookRequest,
    jsonResponse,
    corsHeaders,
} from './engagement.js';
import { handleMcp } from './mcp.js';
import { handleCspReport } from './csp-report.js';
import { handlePresenceRequest } from './presence.js';
import { runProbe } from './probe.js';
import { loadStats } from './stats.js';
import { clientKind, nameRootSpan, recordRequest, routeLabel } from './telemetry.js';

const GITHUB_USERNAME = 'and3rn3t';
const CACHE_TTL_SECONDS = 300; // 5 min edge cache
const NEGATIVE_TTL_SECONDS = 60; // remember a failed lookup briefly so GitHub isn't hammered

// Routes whose requests are not written to portfolio_metrics: a data point would carry the
// visitor's Cloudflare location and a browser/agent guess. Presence keeps nothing about who joined;
// a policy report is recorded on its own, without either (csp-report.js).
const UNRECORDED_ROUTES = new Set(['/presence', '/csp-report']);

// The Durable Object class must be exported from the entry point
export { Presence } from './presence.js';

export default {
    async fetch(request, env, ctx) {
        const started = Date.now();
        const { pathname } = new URL(request.url);
        const routeName = routeLabel(pathname);
        nameRootSpan(ctx, request.method, routeName);

        // Any unexpected failure becomes a JSON 500 that still carries CORS headers; a bare
        // runtime 500 has none, and the browser then reports a misleading CORS error.
        let response;
        try {
            response = await route(request, env, ctx);
        } catch (err) {
            console.error('[worker] unhandled error:', err?.stack ?? err);
            response = jsonResponse({ error: 'internal' }, request, 500);
        }

        const ms = Date.now() - started;
        // A presence handshake is not recorded: "N here now" keeps nothing about who joined, and a
        // data point would carry the visitor's Cloudflare location and a browser/agent guess
        if (!UNRECORDED_ROUTES.has(routeName)) {
            recordRequest(env, {
                route: routeName,
                method: request.method,
                status: response.status,
                ms,
                colo: request.cf?.colo,
                client: clientKind(request.headers.get('User-Agent')),
            });
        }
        // A WebSocket upgrade (101) cannot be rebuilt, and has no use for a timing header
        if (response.status === 101) return response;
        // Copy first: a response from fetch() has immutable headers, and the MCP reply is a stream
        const timed = new Response(response.body, response);
        timed.headers.append('Server-Timing', `worker;dur=${ms}`);
        return timed;
    },

    // The cron trigger in wrangler.toml: the uptime probe (see probe.js)
    async scheduled(_controller, env, _ctx) {
        await runProbe(env);
    },
};

/**
 * The Worker answers at the site's own /api (a route on the zone) and at its workers.dev
 * address, where the same paths have no prefix. Both reach the same handlers.
 * @param {string} pathname
 * @returns {string}
 */
export function routePath(pathname) {
    return pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname;
}

async function route(request, env, ctx) {
    const url = new URL(request.url);
    const path = routePath(url.pathname);

    // The documents agents use to find the site's API and MCP server
    const discovery = await discoveryResponse(url.pathname, request.method);
    if (discovery) return discovery;

    // The MCP server. Only /mcp: the zone route is andernet.dev/mcp, not under /api.
    if (url.pathname === '/mcp') return serveMcp(request, env, ctx);

    // Health check
    if (path === '/health') {
        return new Response(
            JSON.stringify({
                ok: true,
                version: env.CF_VERSION?.tag || env.CF_VERSION?.id?.slice(0, 8) || null,
            }),
            {
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }

    if (path === '/edge') {
        return handleEdge(request, env);
    }

    if (path === '/stats') {
        return handleStats(request, env);
    }

    if (path === '/presence') {
        return handlePresenceRequest(request, env);
    }

    if (path === '/csp-report') {
        return handleCspReport(request, env);
    }

    if (path === '/views') {
        return handleViewsRequest(request, env);
    }

    if (path === '/guestbook') {
        return handleGuestbookRequest(request, env);
    }

    if (path !== '/activity') {
        return new Response('Not found', { status: 404 });
    }

    // CORS pre-flight
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }

    if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405 });
    }

    const result = await loadActivity(env);
    if (!result.ok) return jsonResponse({ error: result.error }, request, result.status);
    return jsonResponse({ ...result.activity, cached: result.cached }, request, 200);
}

/** GET /stats: the numbers behind /status/, cached for five minutes (see stats.js). */
async function handleStats(request, env) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

    const result = await loadStats(env);
    if (!result.ok) return jsonResponse({ error: result.error }, request, result.status);
    const response = jsonResponse({ ...result.stats, cached: result.cached }, request, 200);
    response.headers.set('Cache-Control', 'public, max-age=60');
    return response;
}

/**
 * GET /edge: where this request was served, for the footer's "edge receipt". Nothing is stored,
 * and the answer describes only the caller's own connection, so it is never cached.
 */
function handleEdge(request, env) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders(request) });
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

    const response = jsonResponse(
        {
            colo: request.cf?.colo ?? null,
            httpProtocol: request.cf?.httpProtocol ?? null,
            tlsVersion: request.cf?.tlsVersion ?? null,
            version: env.CF_VERSION?.tag || env.CF_VERSION?.id?.slice(0, 8) || null,
        },
        request,
        200
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
}

/**
 * The latest meaningful GitHub activity: from the edge cache when it has it, else from GitHub.
 * Shared by GET /activity and the MCP tool get_recent_activity.
 * @param {object} env
 * @returns {Promise<{ ok: true, activity: object, cached: boolean } | { ok: false, error: string, status: number }>}
 */
export async function loadActivity(env) {
    // Try the CF cache first.
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.internal/activity/${GITHUB_USERNAME}`);
    const cached = await cache.match(cacheKey);
    if (cached) {
        const data = await cached.json();
        if (data.__negative) {
            return { ok: false, error: data.__negative.error, status: data.__negative.status };
        }
        return { ok: true, activity: data, cached: true };
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
        return { ok: false, error: 'upstream_error', status: 502 };
    }

    const event = pickEvent(events);
    if (!event) {
        await cacheFailure(cache, cacheKey, 'no_activity', 404);
        return { ok: false, error: 'no_activity', status: 404 };
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

    return { ok: true, activity, cached: false };
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

/**
 * MCP requests, limited per client address first: the tools fetch site data and GitHub, so an
 * unthrottled endpoint would be a free way to make this Worker do work. The limiter is the
 * Workers Rate Limiting binding (approximate and per location, which is enough here); without
 * the binding (local dev, tests) requests pass.
 */
async function serveMcp(request, env, ctx) {
    if (env.MCP_LIMITER) {
        const key = `mcp:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
        const { success } = await env.MCP_LIMITER.limit({ key });
        if (!success) {
            const limited = jsonResponse({ error: 'rate_limited' }, request, 429);
            limited.headers.set('Retry-After', '60');
            return limited;
        }
    }
    return handleMcp(request, env, ctx, {
        getActivity: () => loadActivity(env),
        getStats: () => loadStats(env),
    });
}
