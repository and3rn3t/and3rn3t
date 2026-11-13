/**
 * Shared Playwright fixtures. Every spec imports `test`/`expect` from here so the
 * deployed Worker is never called from e2e runs (it would inflate the live view
 * count and make tests depend on the network and on live GitHub data).
 */
import { test as base, expect } from '@playwright/test';
import { WORKER_BASE } from '../../modules/config.js';

const json = (route, body, status = 200) =>
    route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(body),
    });

const dayOffset = offset => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** What /stats answers in e2e runs: every section filled, INP missing (as it is in production now). */
export const STATS_FIXTURE = {
    generatedAt: new Date().toISOString(),
    api: {
        last24h: { errorRate: 0, p50Ms: 0, p95Ms: 2363 },
        last7d: { errorRate: 0.0042, p50Ms: 0, p95Ms: 1800 },
    },
    mcp: [
        { tool: 'list_posts', calls: 12, errors: 0 },
        { tool: 'get_project', calls: 5, errors: 1 },
    ],
    clients: { agentShare: 0.216 },
    uptime: {
        lastProbe: { at: new Date().toISOString(), ok: true },
        days: [
            { day: dayOffset(-2), probes: 288, ok: 288 },
            { day: dayOffset(-1), probes: 288, ok: 280 },
            { day: dayOffset(0), probes: 40, ok: 40 },
        ],
    },
    vitals: { lcpMs: 440, inpMs: null, cls: 0, ttfbMs: 247 },
    crawlers: [
        { category: 'AI Assistant', requests: 532 },
        { category: 'Search Engine Crawler', requests: 337 },
        { category: 'AI Crawler', requests: 5 },
    ],
    edge: { answeredAtEdge: 0.536 },
    cached: false,
};

/**
 * Answer the Worker's endpoints and its presence socket here, so a run never reaches the deployed
 * Worker (it would inflate the live view count and make tests depend on the network).
 * `target` is a page or a browser context: a test that builds its own context must call this on
 * it before opening a page (tests/unit/e2e-isolation.test.js checks that every one does).
 * @param {import('@playwright/test').Page | import('@playwright/test').BrowserContext} target
 */
export async function mockWorker(target) {
    // The "N here now" socket: answered here, never the deployed Worker. One page is not "here
    // now", so by default nothing shows; a test that wants a crowd registers its own.
    await target.routeWebSocket(/\/presence$/, ws => ws.send(JSON.stringify({ count: 1 })));
    await target.route(`${WORKER_BASE}/**`, route => {
        const request = route.request();
        const { pathname } = new URL(request.url());
        if (request.method() === 'OPTIONS') return json(route, {}, 204);
        if (pathname === '/edge') {
            return json(route, {
                colo: 'ORD',
                httpProtocol: 'h2',
                tlsVersion: 'TLSv1.3',
                version: 'abc1234',
            });
        }
        if (pathname === '/stats') return json(route, STATS_FIXTURE);
        if (pathname === '/views') return json(route, { page: 'home', views: 1234 });
        if (pathname === '/guestbook') {
            if (request.method() === 'POST') {
                const entry = { name: 'Test', message: 'Hello', date: '2026-01-01T00:00:00Z' };
                return json(route, { ok: true, entry }, 201);
            }
            return json(route, []);
        }
        if (pathname === '/activity') {
            return json(route, {
                repo: 'and3rn3t/example',
                repoName: 'example',
                repoUrl: 'https://github.com/and3rn3t/example',
                type: 'push',
                message: 'feat: fixture commit',
                branch: 'main',
                pushedAt: '2026-01-01T00:00:00Z',
            });
        }
        return json(route, { error: 'not_stubbed' }, 404);
    });
}

export const test = base.extend({
    page: async ({ page }, use) => {
        await mockWorker(page);
        await use(page);
    },
});

export { expect };
