import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const PRESENCE = /\/presence$/;
const hide = (page, hidden) =>
    page.evaluate(value => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

/** Serve /presence with `count`, and keep track of the connections the page opens. */
async function crowd(page, count) {
    const seen = { opened: 0, closed: 0, sockets: [] };
    await page.routeWebSocket(PRESENCE, ws => {
        seen.opened++;
        seen.sockets.push(ws);
        ws.onClose(() => seen.closed++);
        ws.send(JSON.stringify({ count }));
    });
    return seen;
}

test.describe('"N here now"', () => {
    test('appears beside the edge receipt when two or more pages are open', async ({ page }) => {
        await crowd(page, 3);
        await page.goto('/');
        const presence = page.locator('[data-presence]');
        await expect(presence).toHaveText('· 3 here now');
        await expect(presence).toBeVisible();
        await expect(page.locator('[data-edge-receipt]')).toContainText('Served from');
    });

    test('is not there when you are the only one: one page is not "here now"', async ({ page }) => {
        await crowd(page, 1);
        await page.goto('/');
        await expect(page.locator('[data-edge-receipt]')).toContainText('Served from');
        await expect(page.locator('[data-presence]')).toBeHidden();
    });

    test('follows the count as pages come and go', async ({ page }) => {
        const seen = await crowd(page, 2);
        await page.goto('/');
        await expect(page.locator('[data-presence]')).toHaveText('· 2 here now');
        seen.sockets[0].send(JSON.stringify({ count: 5 }));
        await expect(page.locator('[data-presence]')).toHaveText('· 5 here now');
        seen.sockets[0].send(JSON.stringify({ count: 1 }));
        await expect(page.locator('[data-presence]')).toBeHidden();
    });

    // A tab nobody is looking at is not "here", and must hold nothing open
    test('a tab that is hidden holds no socket, and opens one again when it is shown', async ({
        page,
    }) => {
        const seen = await crowd(page, 4);
        await page.goto('/');
        await expect(page.locator('[data-presence]')).toHaveText('· 4 here now');
        expect(seen.opened).toBe(1);

        await hide(page, true);
        await expect.poll(() => seen.closed).toBe(1);
        await expect(page.locator('[data-presence]')).toBeHidden();

        await hide(page, false);
        await expect.poll(() => seen.opened).toBe(2);
        await expect(page.locator('[data-presence]')).toHaveText('· 4 here now');
    });

    test('leaves the footer as it was when the socket is refused', async ({ page }) => {
        await page.routeWebSocket(PRESENCE, ws => ws.close({ code: 1008, reason: 'no' }));
        await page.goto('/');
        await expect(page.locator('[data-edge-receipt]')).toContainText('Served from');
        await expect(page.locator('[data-presence]')).toBeHidden();
    });

    test('shows on a post page too', async ({ page }) => {
        await crowd(page, 2);
        await page.goto('/');
        const href = await page.locator('a[href^="/posts/"]').first().getAttribute('href');
        await page.goto(href);
        await expect(page.locator('[data-presence]')).toHaveText('· 2 here now');
    });

    for (const theme of ['light', 'dark']) {
        test(`the footer has no axe violations with the line showing, in the ${theme} theme`, async ({
            page,
        }) => {
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            await crowd(page, 3);
            await page.goto('/');
            await expect(page.locator('[data-presence]')).toHaveText('· 3 here now');
            const results = await new AxeBuilder({ page })
                .include('.site-footer')
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .analyze();
            expect(results.violations).toEqual([]);
        });
    }
});
