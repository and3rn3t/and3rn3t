import AxeBuilder from '@axe-core/playwright';
import { test, expect, STATS_FIXTURE } from './fixtures.js';

const STATS = /\/stats$/;

test.describe('the status page', () => {
    test('draws the numbers from /stats', async ({ page }) => {
        await page.goto('/status/');
        await expect(page.locator('[data-verdict-label]')).toHaveText('Responding');
        await expect(page.locator('[data-stat="error-24h"]')).toHaveText('0%');
        await expect(page.locator('[data-stat="error-7d"]')).toHaveText('Last 7 days: 0.42%');
        await expect(page.locator('[data-stat="p50-24h"]')).toHaveText('<1 ms');
        await expect(page.locator('[data-stat="agent-share"]')).toHaveText('22%');
        await expect(page.locator('[data-vitals] .meter')).toHaveCount(4);
        await expect(page.locator('[data-rank="crawlers"] .rank__row')).toHaveCount(3);
        await expect(page.locator('[data-rank="tools"]')).toContainText('1 failed');
    });

    test('INP, which few visits measure, says so instead of showing a number', async ({ page }) => {
        await page.goto('/status/');
        const inp = page.locator('[data-vitals] .meter').nth(1);
        await expect(inp).toContainText('Interaction to Next Paint');
        await expect(inp).toContainText('Not enough visits yet');
    });

    test('the uptime strip can be read with the keyboard, day by day', async ({ page }) => {
        await page.goto('/status/');
        const strip = page.locator('[data-uptime]');
        const readout = page.locator('[data-uptime-readout]');
        await expect(readout).toContainText('checks passed over the 3 days shown');

        await strip.focus();
        await expect(readout).toHaveText('Fri, Nov 13: 40 of 40 checks passed (100%).');
        await page.keyboard.press('ArrowLeft');
        await expect(readout).toHaveText('Thu, Nov 12: 280 of 288 checks passed (97.22%).');
        await page.keyboard.press('Home');
        await expect(readout).toHaveText('No data for this day.'); // the oldest slot is empty
        await page.keyboard.press('End');
        await expect(readout).toContainText('Nov 13');
    });

    test('hovering a day reads it out too, and the table view carries every day', async ({
        page,
    }) => {
        await page.goto('/status/');
        const days = page.locator('.uptime__day');
        await days.last().hover();
        await expect(page.locator('[data-uptime-readout]')).toContainText('Nov 13');

        await page.locator('.status-table summary').click();
        await expect(page.locator('[data-table="uptime"] tbody tr')).toHaveCount(3);
        await expect(page.locator('[data-table="uptime"]')).toContainText('97.22%');
    });

    test('a failed check shows as "Not responding", in words as well as colour', async ({
        page,
    }) => {
        await page.route(STATS, route =>
            route.fulfill({
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify({
                    ...STATS_FIXTURE,
                    uptime: {
                        ...STATS_FIXTURE.uptime,
                        lastProbe: { at: new Date().toISOString(), ok: false },
                    },
                }),
            })
        );
        await page.goto('/status/');
        await expect(page.locator('[data-verdict-label]')).toHaveText('Not responding');
        await expect(page.locator('[data-verdict]')).toHaveAttribute('data-state', 'down');
    });

    test('shows dashes, never zeros, for sections the Worker could not fill', async ({ page }) => {
        await page.route(STATS, route =>
            route.fulfill({
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify({
                    generatedAt: new Date().toISOString(),
                    api: { last24h: null, last7d: null },
                    mcp: null,
                    clients: null,
                    uptime: null,
                    vitals: null,
                    crawlers: null,
                    edge: null,
                }),
            })
        );
        await page.goto('/status/');
        await expect(page.locator('[data-verdict-label]')).toHaveText('No checks recorded yet');
        await expect(page.locator('[data-stat="error-24h"]')).toHaveText('—');
        await expect(page.locator('[data-stat="p95-24h"]')).toHaveText('—');
        await expect(page.locator('[data-stat="agent-share"]')).toHaveText('—');
        await expect(page.locator('[data-vitals]')).not.toContainText(' ms');
    });

    test('says the numbers are unavailable, rather than inventing any, when /stats fails', async ({
        page,
    }) => {
        await page.route(STATS, route => route.fulfill({ status: 503, body: '{}' }));
        await page.goto('/status/');
        await expect(page.locator('[data-verdict-label]')).toHaveText('Numbers unavailable');
        await expect(page.locator('[data-stat="error-24h"]')).toHaveText('—');
    });

    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            await page.goto('/status/');
            await expect(page.locator('[data-verdict-label]')).toHaveText('Responding');
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .exclude('iframe[src*="cloudflare"]')
                .analyze();
            expect(results.violations).toEqual([]);
        });
    }

    test('is reachable from the footer of the home page and is not wider than the screen on a phone', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.goto('/');
        await page.locator('.site-footer a[href="/status/"]').first().click();
        await expect(page).toHaveURL(/\/status\/$/);
        await expect(page.locator('[data-verdict-label]')).toHaveText('Responding');
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });
});
