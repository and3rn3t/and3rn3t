/**
 * Mobile navigation e2e tests
 *
 * The menu is a popover (index.html): the button opens it with no script, and the browser closes it
 * on Escape or a click outside and gives focus back. These tests check that contract, that it holds
 * before main.js has run (and with JavaScript off), and the old regression: a `translateZ(0)` rule
 * once overrode the closed menu's off-screen transform, leaving an invisible overlay that caught
 * every tap. A browser without popover gets modules/menu-fallback.js (tests/unit/menu-fallback.test.js).
 */
import { test, expect } from './fixtures.js';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const menuAt = (page, y) =>
    page.evaluate(yy => Boolean(document.elementFromPoint(195, yy)?.closest('#nav-menu')), y);
const isOpen = page =>
    page.evaluate(() => document.getElementById('nav-menu').matches(':popover-open'));

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
    await expect.poll(() => isOpen(page)).toBe(false);
    await expect.poll(() => menuAt(page, 400)).toBe(false);
});

test.describe('menu button accessibility', () => {
    const toggle = page => page.locator('#mobile-menu');

    test('aria-controls points at the menu, and the browser reports whether it is open', async ({
        page,
    }) => {
        await page.goto('/');
        const controls = await toggle(page).getAttribute('aria-controls');
        expect(await page.locator(`#${controls}`).count()).toBe(1);
        expect(controls).toBe('nav-menu');
        // The state is the browser's own, so the markup must not hold a stale copy of it
        expect(await toggle(page).getAttribute('aria-expanded')).toBeNull();

        // The browser's own accessibility tree says expanded or not (the attribute is not there for
        // role queries to read, so ask the tree itself)
        const expanded = async () => {
            const session = await page.context().newCDPSession(page);
            const { nodes } = await session.send('Accessibility.getFullAXTree');
            await session.detach();
            const node = nodes.find(
                candidate =>
                    candidate.role?.value === 'button' &&
                    candidate.name?.value === 'Toggle navigation menu'
            );
            return node?.properties?.find(property => property.name === 'expanded')?.value.value;
        };
        expect(await expanded()).toBe(false);
        await toggle(page).tap();
        await expect.poll(expanded).toBe(true);
        await toggle(page).tap();
        await expect.poll(expanded).toBe(false);
        expect(await isOpen(page)).toBe(false);
    });

    test('Escape closes the menu and returns focus to the button', async ({ page }) => {
        await page.goto('/');
        await toggle(page).tap();
        await expect.poll(() => isOpen(page)).toBe(true);

        await page.keyboard.press('Escape');

        await expect.poll(() => isOpen(page)).toBe(false);
        await expect(toggle(page)).toBeFocused();
    });

    test('a tap outside the menu closes it', async ({ page }) => {
        await page.goto('/');
        await toggle(page).tap();
        await expect.poll(() => isOpen(page)).toBe(true);

        // The sheet covers the page below the bar, so outside it is the bar's own empty space
        await page.touchscreen.tap(160, 30);

        await expect.poll(() => isOpen(page)).toBe(false);
    });

    test('Escape does nothing while the menu is closed', async ({ page }) => {
        await page.goto('/');
        await page.locator('body').press('Escape');
        expect(await isOpen(page)).toBe(false);
        await expect(toggle(page)).not.toBeFocused();
    });
});

// The point of a popover: nothing here needs main.js
test.describe('before and without the script', () => {
    test('the button opens the menu and Escape closes it while main.js has not run', async ({
        page,
    }) => {
        await page.route('**/main.js', route => route.abort());
        await page.goto('/');
        await page.locator('#mobile-menu').tap();
        await expect.poll(() => isOpen(page)).toBe(true);
        await expect(page.locator('#nav-menu a[href="#projects"]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect.poll(() => isOpen(page)).toBe(false);
    });

    test.describe('with JavaScript off', () => {
        test.use({ javaScriptEnabled: false });
        test('the narrow screen can still open the menu', async ({ page }) => {
            await page.goto('/');
            await page.locator('#mobile-menu').tap();
            await expect(page.locator('#nav-menu a[href="#projects"]')).toBeVisible();
        });
    });
});

test('widening the window to the desktop bar leaves nothing open', async ({ page }) => {
    await page.goto('/');
    await page.locator('#mobile-menu').tap();
    await expect.poll(() => isOpen(page)).toBe(true);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect.poll(() => isOpen(page)).toBe(false);
    await expect(page.locator('#nav-menu a[href="#projects"]')).toBeVisible();
});

// A browser without popover: the property is missing and the attributes mean nothing. Emulated by
// removing both before the page looks at them, so the old class-toggling menu has to carry it.
test.describe('a browser without popover', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            delete window.HTMLElement.prototype.popover;
            new window.MutationObserver(() => {
                document.getElementById('nav-menu')?.removeAttribute('popover');
                document.getElementById('mobile-menu')?.removeAttribute('popovertarget');
            }).observe(document, { childList: true, subtree: true });
        });
    });
    const toggle = page => page.locator('#mobile-menu');
    const active = page =>
        page.evaluate(() => document.getElementById('nav-menu').classList.contains('active'));

    test('the fallback module is fetched, and runs the menu as before', async ({ page }) => {
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/');
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        expect(requested).toContain('/modules/menu-fallback.js');
        await toggle(page).tap();
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#nav-menu a[href="#projects"]')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
        await expect(toggle(page)).toBeFocused();
        expect(await active(page)).toBe(false);
    });
});

test('a browser with popover never fetches the fallback', async ({ page }) => {
    const requested = [];
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    expect(requested).not.toContain('/modules/menu-fallback.js');
});
