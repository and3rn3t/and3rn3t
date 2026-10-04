/**
 * Contact tabs e2e tests
 *
 * Covers: message/guestbook tabs (ARIA tabs pattern), lazy guestbook +
 * Turnstile loading, and old `#guestbook` links opening the guestbook tab.
 */
import { test, expect } from '@playwright/test';

const waitForTabs = page =>
    page.waitForFunction(() => Boolean(globalThis.appState?.managers?.contactTabs), {
        timeout: 10000,
    });

const turnstileScripts = page =>
    page.locator('script[src*="challenges.cloudflare.com/turnstile"]').count();

test('message tab is selected by default and Turnstile is not loaded', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#contact-tab-message')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#contact-panel-message')).toBeVisible();
    await expect(page.locator('#contact-panel-guestbook')).toBeHidden();
    expect(await turnstileScripts(page)).toBe(0);
});

test('guestbook tab shows the guestbook and loads Turnstile on demand', async ({ page }) => {
    await page.goto('/');
    await waitForTabs(page);
    await page.locator('#contact-tab-guestbook').click();

    await expect(page.locator('#contact-tab-guestbook')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#contact-panel-guestbook')).toBeVisible();
    await expect(page.locator('#contact-panel-message')).toBeHidden();
    await expect.poll(() => turnstileScripts(page)).toBe(1);
});

test('arrow keys move between tabs', async ({ page }) => {
    await page.goto('/');
    await waitForTabs(page);
    await page.locator('#contact-tab-message').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#contact-tab-guestbook')).toBeFocused();
    await expect(page.locator('#contact-panel-guestbook')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.locator('#contact-tab-message')).toBeFocused();
    await expect(page.locator('#contact-panel-message')).toBeVisible();
});

test('#guestbook links open the guestbook tab', async ({ page }) => {
    await page.goto('/#guestbook');
    await expect(page.locator('#contact-panel-guestbook')).toBeVisible();
});
