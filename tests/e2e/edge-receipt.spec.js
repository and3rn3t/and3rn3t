import { test, expect } from './fixtures.js';

test.describe('edge receipt', () => {
    test('the footer says where the visit was served', async ({ page }) => {
        await page.goto('/');
        const receipt = page.locator('[data-edge-receipt]');
        await expect(receipt).toHaveText(/^Served from ORD · API \d+ ms · Worker abc1234$/, {
            timeout: 10_000,
        });
        await expect(receipt).toBeVisible();
    });

    test('a post page shows it too', async ({ page }) => {
        await page.goto('/');
        const href = await page.locator('a[href^="/posts/"]').first().getAttribute('href');
        await page.goto(href);
        await expect(page.locator('[data-edge-receipt]')).toHaveText(/^Served from ORD/, {
            timeout: 10_000,
        });
    });

    test('the footer stays as it was when the Worker does not answer', async ({ page }) => {
        await page.route(/\/edge$/, route => route.fulfill({ status: 503, body: '{}' }));
        await page.goto('/');
        await page.waitForTimeout(3500);
        await expect(page.locator('[data-edge-widget]')).toBeHidden();
    });
});
