/**
 * Theme toggle + keyboard interactions e2e tests (5.3)
 *
 * Covers: dark/light theme switch, `?` keyboard help panel, `g h` navigation.
 */
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Keyboard shortcuts (?, g h) are wired by the keyboard-help manager, which
    // initializes after several deferred dynamic imports. Wait for it so key
    // presses aren't dropped before the listeners attach.
    await page
        .waitForFunction(() => Boolean(globalThis.appState?.managers?.keyboardHelp), {
            timeout: 10000,
        })
        .catch(() => {});
});

// ── Theme ─────────────────────────────────────────────────────────────────────

test('theme toggle button is present and interactive', async ({ page }) => {
    const toggle = page.locator('#theme-toggle, [aria-label*="theme" i]').first();
    await expect(toggle).toBeVisible();
});

test('clicking the theme toggle flips the theme and remembers it', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('theme', 'light'));
    await page.reload();
    const toggle = page.locator('#theme-toggle');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to dark theme');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('aria-label', 'Switch to light theme');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('with no saved choice the theme follows the system preference', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the dark theme is applied from a saved choice', async ({ page }) => {
    // Force dark via localStorage so we control the state.
    await page.evaluate(() => {
        localStorage.setItem('theme', 'dark');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // The old body.dark-theme class is gone: the theme is <html data-theme> and nothing else
    await expect(page.locator('body')).not.toHaveClass(/dark-theme/);
});

test('the light theme is applied from a saved choice', async ({ page }) => {
    await page.evaluate(() => {
        localStorage.setItem('theme', 'light');
    });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

// ── `?` keyboard help ─────────────────────────────────────────────────────────

test('pressing "?" opens the keyboard help panel', async ({ page }) => {
    await page.evaluate(() => document.activeElement?.blur()); // no field has focus (a click on the body's centre can land in the contact form)
    await page.keyboard.press('?');
    const panel = page.locator('#keyboard-help');
    await expect(panel).toBeVisible({ timeout: 2000 });
});

test('Esc closes the keyboard help panel', async ({ page }) => {
    await page.evaluate(() => document.activeElement?.blur()); // no field has focus (a click on the body's centre can land in the contact form)
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
    await page.evaluate(() => document.activeElement?.blur()); // no field has focus (a click on the body's centre can land in the contact form)
    await page.keyboard.press('g');
    await page.keyboard.press('h');
    // Wait a tick for smooth scroll to begin.
    await page.waitForTimeout(400);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeLessThan(200);
});
