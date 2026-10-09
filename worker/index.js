/**
 * Cloudflare Worker — and3rn3t portfolio backend
 *
 * GET /og               → dynamic OG image SVG card (1200×630)
 * GET /og?project=slug  → per-project OG image card
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

import { handleOgRequest } from './og.js';
import { pickEvent, buildActivity } from '../modules/utils/activity.js';
import {
    handleViewsRequest,
    handleGuestbookRequest,
    jsonResponse,
    corsHeaders,
} from './engagement.js';

const GITHUB_USERNAME = 'and3rn3t';
const CACHE_TTL_SECONDS = 300; // 5 min edge cache

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Health check
        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (url.pathname === '/og') {
            return handleOgRequest(request);
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
            return jsonResponse({ error: 'upstream_error', detail: err.message }, request, 502);
        }

        const event = pickEvent(events);
        if (!event) {
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
    },
};

/**
 * GitHub's events API no longer includes commit lists in PushEvent payloads or
 * titles in PullRequestEvent payloads. Fill them back in with one API call when
 * absent. Mutates `event`; failures leave it untouched (buildActivity falls back).
 */
export async function hydrateEvent(event, headers) {
    const payload = event.payload;
    if (!payload) return;
    try {
        if (event.type === 'PushEvent' && !payload.commits?.length && payload.head) {
            const resp = await fetch(
                `https://api.github.com/repos/${event.repo?.name}/commits/${payload.head}`,
                { headers }
            );
            if (resp.ok) {
                const commit = await resp.json();
                payload.commits = [{ sha: commit.sha, message: commit.commit?.message ?? '' }];
            }
        } else if (
            event.type === 'PullRequestEvent' &&
            payload.pull_request?.url &&
            !payload.pull_request.title
        ) {
            const resp = await fetch(payload.pull_request.url, { headers });
            if (resp.ok) {
                const pr = await resp.json();
                payload.pull_request.title = pr.title;
            }
        }
    } catch {
        // Best effort — keep the generic fallback text.
    }
}
