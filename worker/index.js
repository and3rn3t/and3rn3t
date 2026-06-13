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

const GITHUB_USERNAME = 'and3rn3t';
const CACHE_TTL_SECONDS = 300; // 5 min edge cache
const CORS_ORIGIN = 'https://and3rn3t.github.io'; // tighten: only the live site

// Event types we care about, in priority order.
const INTERESTING_TYPES = new Set([
    'PushEvent',
    'PullRequestEvent',
    'CreateEvent',
    'ReleaseEvent',
    'WatchEvent',
]);

// Repos to skip (e.g. this portfolio repo — too noisy).
const SKIP_REPOS = new Set(['and3rn3t/and3rn3t']);

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
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'and3rn3t-portfolio-worker/1.0',
        };
        if (env.GH_TOKEN) {
            ghHeaders['Authorization'] = `Bearer ${env.GH_TOKEN}`;
        }

        let events;
        try {
            const resp = await fetch(
                `https://api.github.com/users/${GITHUB_USERNAME}/events/public?per_page=30`,
                { headers: ghHeaders }
            );
            if (!resp.ok) {
                throw new Error(`GitHub API ${resp.status}`);
            }
            events = await resp.json();
        } catch (err) {
            return jsonResponse({ error: 'upstream_error', detail: err.message }, request, 502);
        }

        const activity = pickActivity(events);
        if (!activity) {
            return jsonResponse({ error: 'no_activity' }, request, 404);
        }

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

/** Pick the most interesting recent event, skipping noise. */
function pickActivity(events) {
    for (const event of events) {
        const repo = event.repo?.name ?? '';
        if (SKIP_REPOS.has(repo) || !INTERESTING_TYPES.has(event.type)) continue;
        const result = buildActivity(event, repo);
        if (result) return result;
    }
    return null;
}

function buildActivity(event, repo) {
    const repoName = repo.split('/').pop();
    const repoUrl = `https://github.com/${repo}`;
    const pushedAt = event.created_at ?? null;
    const base = { repo, repoName, repoUrl, pushedAt };

    if (event.type === 'PushEvent') {
        const commits = event.payload?.commits ?? [];
        const commit = [...commits].reverse().find(
            (c) => !c.message.startsWith('Merge')
        ) ?? commits.at(-1);
        const branch = (event.payload?.ref ?? '').replace('refs/heads/', '') || 'main';
        return { ...base, type: 'push', message: commit?.message?.split('\n')[0] ?? null, branch };
    }

    if (event.type === 'PullRequestEvent') {
        const pr = event.payload?.pull_request;
        return { ...base, type: 'pr', message: pr?.title ?? null, branch: pr?.head?.ref ?? null };
    }

    if (event.type === 'CreateEvent') {
        const refType = event.payload?.ref_type;
        if (refType !== 'repository' && refType !== 'branch') return null;
        const message = refType === 'repository'
            ? `Created repo ${repoName}`
            : `Created branch ${event.payload?.ref}`;
        return { ...base, type: 'create', message, branch: null };
    }

    if (event.type === 'ReleaseEvent') {
        return { ...base, type: 'release', message: `Released ${event.payload?.release?.tag_name}`, branch: null };
    }

    if (event.type === 'WatchEvent') {
        return { ...base, type: 'star', message: `Starred ${repoName}`, branch: null };
    }

    return null;
}

function corsHeaders(request) {
    const origin = request.headers.get('Origin') ?? '';
    // Allow the live site + localhost for local dev.
    const allowed = origin === CORS_ORIGIN || origin.startsWith('http://localhost');
    return {
        'Access-Control-Allow-Origin': allowed ? origin : CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
}

function jsonResponse(data, request, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request),
        },
    });
}
