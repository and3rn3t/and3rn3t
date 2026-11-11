/**
 * Deep-link e2e tests
 *
 * Loading the page with #post/<slug> or #project/<slug> must reach the right view
 * without throwing (navigation.js used to run querySelector on these hashes).
 */
import { test, expect } from './fixtures.js';

test('legacy #post/<slug> links redirect to the post page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/#post/how-this-site-works');
    await page.waitForURL('**/posts/how-this-site-works/');
    await expect(page.locator('h1')).toContainText('How This Site Works');
    expect(errors).toEqual([]);
});

test('legacy #project/<slug> links redirect to the project page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/#project/health');
    await page.waitForURL('**/projects/health/');
    await expect(page.locator('h1')).toBeVisible();
    expect(errors).toEqual([]);
});

test('legacy #project/<slug> links are case-insensitive (old modal slugs kept repo case)', async ({
    page,
}) => {
    await page.goto('/#project/HealthKitBridge');
    await page.waitForURL('**/projects/healthkitbridge/');
    await expect(page.locator('h1')).toBeVisible();
});
