/**
 * Prerender on hover, in a real browser, with the real report-only policy on the pages: Chromium
 * accepts the inline rules (the policy does not block them), and hovering a project link makes it
 * try to prerender that page.
 *
 * Whether the prerender then succeeds cannot be tested here: Playwright drives Chromium over
 * DevTools, and Chromium turns prerendering off while DevTools is attached (it reports the attempt
 * as a failure with the reason PrerenderingDisabledByDevTools). The attempt, and the rules being
 * accepted, are what this checks; the page's behaviour while prerendered is in
 * tests/unit/prerender-rules.test.js.
 */
import { join } from 'node:path';
import { test, expect } from './fixtures.js';
import { buildCsp, inlineHashes } from '../../scripts/zone-headers.mjs';

const ROOT = join(import.meta.dirname, '..', '..');

test.describe('prerender on hover', () => {
    test('the browser accepts the rules under the policy, and a hovered project link triggers a prerender', async ({
        page,
        context,
    }) => {
        const policy = buildCsp(inlineHashes(ROOT));
        const reports = [];
        await page.route('**/*', async route => {
            if (route.request().resourceType() !== 'document') return route.fallback();
            const response = await route.fetch();
            return route.fulfill({
                response,
                headers: { ...response.headers(), 'content-security-policy-report-only': policy },
            });
        });
        await page.route('**/api/csp-report', route => {
            reports.push(route.request().postData());
            return route.fulfill({ status: 204 });
        });

        const cdp = await context.newCDPSession(page);
        const ruleSets = [];
        const attempts = [];
        cdp.on('Preload.ruleSetUpdated', event => ruleSets.push(event.ruleSet));
        cdp.on('Preload.prerenderStatusUpdated', event => attempts.push(event.key.url));
        await cdp.send('Preload.enable');

        await page.goto('/');
        const link = page.locator('a[href^="/projects/"]').first();
        const href = await link.getAttribute('href');

        await expect
            .poll(() => ruleSets.length, 'the browser registered the rules')
            .toBeGreaterThan(0);
        expect(ruleSets.map(set => set.errorType)).toEqual(ruleSets.map(() => undefined));

        await link.scrollIntoViewIfNeeded();
        await link.hover();
        await expect
            .poll(
                () => attempts.some(url => url.endsWith(href)),
                'hovering the link tried a prerender'
            )
            .toBe(true);

        expect(reports).toEqual([]); // and the policy did not object to the rules
    });
});
