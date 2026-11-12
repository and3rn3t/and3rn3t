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

export const test = base.extend({
    page: async ({ page }, use) => {
        await page.route(`${WORKER_BASE}/**`, route => {
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
        await use(page);
    },
});

export { expect };
