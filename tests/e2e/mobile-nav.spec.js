/**
 * Mobile navigation e2e tests
 *
 * Regression: a `translateZ(0)` rule once overrode the closed menu's
 * off-screen transform, leaving an invisible overlay that caught every tap.
 */
import { test, expect } from './fixtures.js';

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

test.describe('menu button accessibility', () => {
    const toggle = page => page.locator('#mobile-menu');

    test('aria-controls points at the menu and aria-expanded follows its state', async ({
        page,
    }) => {
        await page.goto('/');
        const controls = await toggle(page).getAttribute('aria-controls');
        expect(await page.locator(`#${controls}`).count()).toBe(1);
        expect(controls).toBe('nav-menu');

        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await toggle(page).tap();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
        await toggle(page).tap();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#nav-menu')).not.toHaveClass(/active/);
    });

    test('Escape closes the menu and returns focus to the button', async ({ page }) => {
        await page.goto('/');
        await toggle(page).tap();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');

        await page.keyboard.press('Escape');

        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#nav-menu')).not.toHaveClass(/active/);
        await expect(toggle(page)).toBeFocused();
    });

    test('a click outside the menu closes it', async ({ page }) => {
        await page.goto('/');
        await toggle(page).tap();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');

        await page.evaluate(() => document.body.click());

        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    });

    test('Escape does nothing while the menu is closed', async ({ page }) => {
        await page.goto('/');
        await page.locator('body').press('Escape');
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle(page)).not.toBeFocused();
    });
});
