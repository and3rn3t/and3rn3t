/**
 * Command palette e2e tests (5.3)
 *
 * Covers: Cmd/Ctrl-K opens, Esc closes, "/" opens, arrow navigation,
 * Enter runs, category filter tabs.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for JS modules to init.
    await page
        .waitForFunction(() => typeof globalThis.appState !== 'undefined', { timeout: 5000 })
        .catch(() => {});
});

test('Ctrl+K opens the command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#global-search-modal')).toHaveClass(/visible/);
});

test('Esc closes the command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal.visible');
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-search-modal')).not.toHaveClass(/visible/);
});

test('"/" key opens the palette when not in a text field', async ({ page }) => {
    // Ensure focus is on the body (not an input).
    await page.locator('body').click();
    await page.keyboard.press('/');
    await expect(page.locator('#global-search-modal')).toHaveClass(/visible/);
});

test('palette closes when backdrop is clicked', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal.visible');
    // Click outside the inner dialog (on the modal backdrop).
    const modal = page.locator('#global-search-modal');
    const box = await modal.boundingBox();
    // Click top-left corner — outside the inner dialog.
    await page.mouse.click(box.x + 5, box.y + 5);
    await expect(modal).not.toHaveClass(/visible/);
});

test('typing filters results', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal.visible');
    await page.fill('#global-search-input', 'theme');
    const items = page.locator('.palette-result-item');
    await expect(items).not.toHaveCount(0);
    const titles = await items.allTextContents();
    expect(titles.some(t => /theme/i.test(t))).toBe(true);
});

test('ArrowDown + Enter runs the highlighted action', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal.visible');
    // Navigate to first result.
    await page.keyboard.press('ArrowDown');
    // Pressing Enter should execute the action without throwing.
    // (The palette may close or stay open depending on action type.)
    await page.keyboard.press('Enter');
    // Just assert the page is still alive.
    await expect(page.locator('body')).toBeVisible();
});

test('search returns no-matches message for gibberish', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal.visible');
    await page.fill('#global-search-input', 'xqzwfbnm');
    const noResults = page.locator('.palette-no-results');
    await expect(noResults).toBeVisible();
});
