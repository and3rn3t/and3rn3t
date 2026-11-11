/**
 * The 404 page (generated) and the offline page (hand-written and self-contained, because the
 * service worker shows it when the network is down).
 */
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

const scan = page =>
    new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .exclude('iframe[src*="cloudflare"]')
        .analyze();

test.describe('404 page', () => {
    test('says what happened and links onward', async ({ page }) => {
        await page.goto('/404.html');
        await expect(page.locator('h1')).toContainText('nothing at this address');
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
        for (const [name, href] of [
            ['Selected work', '/#projects'],
            ['Writing', '/#writing'],
            ['Contact', '/#contact'],
        ]) {
            await expect(page.locator('.not-found').getByRole('link', { name })).toHaveAttribute(
                'href',
                href
            );
        }
        await page.getByRole('link', { name: /Back to the home page/ }).click();
        await page.waitForURL(/\/$/);
        await expect(page.locator('#home, .intro').first()).toBeVisible();
    });

    test('works from a deep address: every asset URL is absolute', async ({ page }) => {
        // GitHub Pages serves 404.html at whatever address was missing. Serve it at a deep one.
        const html = await (await page.request.get('/404.html')).text();
        await page.route('**/no/such/deep/page/', route =>
            route.fulfill({ status: 404, contentType: 'text/html', body: html })
        );
        const failed = [];
        page.on('response', response => {
            if (response.status() >= 400 && !response.url().includes('/no/such/'))
                failed.push(`${response.status()} ${response.url()}`);
        });
        await page.goto('/no/such/deep/page/');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1')).toBeVisible();
        expect(await page.evaluate(() => getComputedStyle(document.body).margin)).toBe('0px');
        expect(failed).toEqual([]);
    });

    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/404.html');
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            expect((await scan(page)).violations).toEqual([]);
        });
    }
});

test.describe('offline page', () => {
    test('is self-contained: it requests nothing but itself', async ({ page }) => {
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/offline.html');
        await page.waitForLoadState('networkidle');
        expect(requested.filter(path => !path.startsWith('data:'))).toEqual(['/offline.html']);
    });

    test('shows its connection status and offers a retry and a way home', async ({ page }) => {
        await page.goto('/offline.html');
        await expect(page.getByRole('status')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute(
            'href',
            '/'
        );
    });

    test('does not reload in a loop when the browser says it is online', async ({ page }) => {
        let loads = 0;
        page.on('load', () => (loads += 1));
        await page.goto('/offline.html');
        await page.waitForTimeout(7000); // past the old five-second poll, and the one-second reload
        expect(loads).toBe(1);
    });

    test('does not promise a reload when it loads while the browser says it is online', async ({
        page,
    }) => {
        await page.goto('/offline.html');
        const status = page.getByRole('status');
        await expect(status).toHaveText('Connected, but the site did not load');
        await expect(status).not.toContainText('reloading');
    });

    test('reloads once the connection returns', async ({ page, context }) => {
        await page.goto('/offline.html');
        await context.setOffline(true);
        await expect(page.getByRole('status')).toHaveText('No connection');
        const reloaded = page.waitForEvent('load');
        await context.setOffline(false);
        // It says so before it does it
        await expect(page.getByRole('status')).toHaveText('Back online, reloading…');
        await reloaded;
    });

    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme, with the same colours as the site`, async ({
            page,
        }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/offline.html');
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            expect((await scan(page)).violations).toEqual([]);

            // The tokens are copied from core.css; fail if they drift apart
            const colours = await page.evaluate(() =>
                Object.fromEntries(
                    [
                        '--surface',
                        '--text',
                        '--muted',
                        '--border',
                        '--accent',
                        '--accent-contrast',
                    ].map(name => [
                        name,
                        getComputedStyle(document.body).getPropertyValue(name).trim(),
                    ])
                )
            );
            await page.goto('/404.html');
            for (const [name, value] of Object.entries(colours)) {
                expect(
                    await page.evaluate(
                        n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
                        name
                    ),
                    name
                ).toBe(value);
            }
        });
    }
});
