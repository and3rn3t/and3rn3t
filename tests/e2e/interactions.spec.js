/**
 * Theme toggle + keyboard interactions e2e tests (5.3)
 *
 * Covers: dark/light theme switch, `?` keyboard help panel, `g h` navigation.
 */
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

// ── Theme ─────────────────────────────────────────────────────────────────────

test('theme toggle button is present and interactive', async ({ page }) => {
    const toggle = page.locator('#theme-toggle, [aria-label*="theme" i]').first();
    await expect(toggle).toBeVisible();
});

test('body gets dark-theme class when dark mode is applied', async ({ page }) => {
    // Force dark via localStorage so we control the state.
    await page.evaluate(() => {
        localStorage.setItem('theme', 'dark');
        localStorage.removeItem('followSystemTheme');
    });
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/dark-theme/);
});

test('body does not have dark-theme class after switching to light', async ({ page }) => {
    await page.evaluate(() => {
        localStorage.setItem('theme', 'light');
        localStorage.removeItem('followSystemTheme');
    });
    await page.reload();
    await expect(page.locator('body')).not.toHaveClass(/dark-theme/);
});

// ── `?` keyboard help ─────────────────────────────────────────────────────────

test('pressing "?" opens the keyboard help panel', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');
    const panel = page.locator('#keyboard-help');
    await expect(panel).toBeVisible({ timeout: 2000 });
});

test('Esc closes the keyboard help panel', async ({ page }) => {
    await page.locator('body').click();
    await page.keyboard.press('?');
    const panel = page.locator('#keyboard-help');
    await expect(panel).toBeVisible({ timeout: 2000 });
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
});

// ── Navigation shortcuts ───────────────────────────────────────────────────────

test('"g" then "h" scrolls to the hero/home section', async ({ page }) => {
    // First scroll down so we're not already at top.
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.locator('body').click();
    await page.keyboard.press('g');
    await page.keyboard.press('h');
    // Wait a tick for smooth scroll to begin.
    await page.waitForTimeout(400);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeLessThan(200);
});
