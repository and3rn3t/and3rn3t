/**
 * The report-only Content-Security-Policy, end to end in a real browser: the policy the zone sends
 * (scripts/zone-headers.mjs) is put on the local pages, and the report Chromium actually posts is
 * read by the Worker's own parser (worker/csp-report.js). So a change to the policy, or to what a
 * browser sends, that the Worker could not read fails here and not in production.
 */
import { join } from 'node:path';
import { test, expect } from './fixtures.js';
import { buildCsp, inlineHashes } from '../../scripts/zone-headers.mjs';
import { blockedSource, directiveName, parseReports } from '../../worker/csp-report.js';

const ROOT = join(import.meta.dirname, '..', '..');

/** Serve the real policy, report-only, on every page, and keep the reports the browser posts. */
async function withPolicy(page) {
    const policy = buildCsp(inlineHashes(ROOT));
    const posted = [];
    await page.route('**/*', async route => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        return route.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy-report-only': policy },
        });
    });
    await page.route('**/api/csp-report', route => {
        posted.push({
            type: route.request().headers()['content-type'],
            body: route.request().postData(),
        });
        return route.fulfill({ status: 204 });
    });
    return posted;
}

test.describe('the report-only policy', () => {
    test('the site itself breaks none of it, on the pages it serves', async ({ page }) => {
        const posted = await withPolicy(page);
        for (const path of ['/', '/status/', '/404.html']) {
            await page.goto(path);
            await page.waitForTimeout(1200);
        }
        expect(posted.map(report => report.body)).toEqual([]);
    });

    test('a violation is posted to /api/csp-report, in a format the Worker reads', async ({
        page,
    }) => {
        const posted = await withPolicy(page);
        await page.goto('/');
        await page.waitForTimeout(800);
        expect(posted).toHaveLength(0); // clean before we break it

        // An inline script nobody hashed: exactly what the policy exists to catch
        await page.addScriptTag({ content: 'globalThis.__violation = 1;' });
        await expect.poll(() => posted.length).toBeGreaterThan(0);

        const [report] = posted;
        expect(report.type).toMatch(/csp-report|reports\+json/);
        const [parsed] = parseReports(report.body);
        expect(parsed, report.body).toBeDefined();
        expect(directiveName(parsed.directive)).toBe('script-src-elem');
        expect(blockedSource(parsed.blockedUrl)).toBe('inline');
        // (On the real site the page is andernet.dev, so the Worker keeps it; here it is localhost.)
        expect(new URL(parsed.documentUrl).pathname).toBe('/');
    });
});
