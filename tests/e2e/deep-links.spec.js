/**
 * Deep-link e2e tests
 *
 * Loading the page with #post/<slug> or #project/<slug> must open the right view
 * without throwing (navigation.js used to run querySelector on these hashes).
 */
import { test, expect } from '@playwright/test';

test('#post/<slug> opens the article without page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/#post/how-this-site-works');
    await expect(page.locator('#blog-article h1')).toBeVisible();
    expect(errors).toEqual([]);
});

test('article back link returns to the writing list', async ({ page }) => {
    await page.goto('/#post/how-this-site-works');
    await page.locator('.blog-back-link').click();
    await expect(page.locator('#blog-article')).toBeHidden();
    await expect(page.locator('#blog-posts')).toBeVisible();
    expect(new URL(page.url()).hash).toBe('#writing');
});

test('#project/<slug> opens the case study without page errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto('/#project/health');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(errors).toEqual([]);
});
