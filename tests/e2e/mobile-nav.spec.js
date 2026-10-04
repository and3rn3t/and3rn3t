/**
 * Mobile navigation e2e tests
 *
 * Regression: a `translateZ(0)` rule once overrode the closed menu's
 * off-screen transform, leaving an invisible overlay that caught every tap.
 */
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const menuAt = (page, y) =>
    page.evaluate(yy => Boolean(document.elementFromPoint(195, yy)?.closest('#nav-menu')), y);

test('closed mobile menu does not cover the page', async ({ page }) => {
    await page.goto('/');
    for (const y of [200, 400, 700]) {
        expect(await menuAt(page, y)).toBe(false);
    }
});

test('mobile menu opens, and a link tap closes it', async ({ page }) => {
    await page.goto('/');
    await page.locator('#mobile-menu').tap();
    const link = page.locator('#nav-menu a[href="#projects"]');
    await expect(link).toBeVisible();
    // Let the slide-in and staggered item animations finish; a tap on a
    // still-moving link can miss it.
    await page.waitForFunction(() =>
        document
            .getElementById('nav-menu')
            .getAnimations({ subtree: true })
            .every(a => a.playState !== 'running')
    );

    // Chromium's touch emulation reads two taps in quick succession as a
    // double-tap and synthesizes no click, so space them like a person would.
    await page.waitForTimeout(500);
    await link.tap();
    await expect(page.locator('#nav-menu')).not.toHaveClass(/active/);
    await expect.poll(() => menuAt(page, 400)).toBe(false);
});
