/**
 * Deep-link e2e tests
 *
 * Loading the page with #post/<slug> or #project/<slug> must reach the right view
 * without throwing (navigation.js used to run querySelector on these hashes).
 */
import { test, expect } from '@playwright/test';

test('legacy #post/<slug> links redirect to the post page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/#post/how-this-site-works');
    await page.waitForURL('**/posts/how-this-site-works/');
    await expect(page.locator('h1')).toContainText('How This Site Works');
    expect(errors).toEqual([]);
});

test('#project/<slug> opens the case study without page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/#project/health');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
});
