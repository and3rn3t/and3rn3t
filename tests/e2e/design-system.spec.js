/**
 * The design system's contract: cascade layers, theme, navigation chrome and the lead card.
 */
import { test, expect } from './fixtures.js';

const rootVar = (page, name) =>
    page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe('cascade layers', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    // The legacy stylesheet shrinks the spacing scale on phones. It sits in a layer, and the
    // shared scale in core.css sits in a layer *below* it; if the layer order were ever
    // fixed after the legacy layer first appeared, the scale would win and every legacy
    // section would grow.
    test('legacy keeps its mobile spacing override', async ({ page }) => {
        await page.goto('/');
        expect(await rootVar(page, '--space-10')).toBe('2rem');
        expect(await rootVar(page, '--space-8')).toBe('1.5rem');
    });
});

test('the layer order is declared before any layer is used', async ({ page }) => {
    await page.goto('/');
    const first = await page.evaluate(() => document.querySelector('head style').textContent);
    expect(first).toMatch(
        /@layer scale, legacy, reset, tokens, base, components, sections, utilities;/
    );
});

test.describe('theme', () => {
    test('sets <html data-theme> before first paint, from the saved choice', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
        await page.goto('/', { waitUntil: 'commit' });
        // The head script runs before the body exists
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        expect(
            await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
        ).toBe('dark');
    });

    test('follows the OS when nothing is saved', async ({ page }) => {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });

    test('the toggle flips data-theme and the semantic colours follow', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('theme', 'light'));
        await page.goto('/');
        const background = () =>
            page.evaluate(() => getComputedStyle(document.querySelector('.intro')).backgroundColor);
        expect(await background()).toBe('rgb(251, 251, 248)'); // --surface, light

        await page.locator('#theme-toggle').click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        // Polled: under reduced motion the legacy stylesheet makes colour changes a
        // one-frame transition, so the value settles on the next frame.
        await expect.poll(background).toBe('rgb(11, 13, 11)'); // --surface, dark
    });
});

test.describe('navigation chrome', () => {
    test('the search button opens the command palette', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => Boolean(globalThis.appState?.managers?.palette));
        await page.locator('.site-nav__search').click();
        await expect(page.locator('#global-search-modal')).toHaveClass(/visible/);
        await expect(page.locator('#global-search-input')).toBeFocused();
    });

    test('the nav gets a border once the page has scrolled', async ({ page }) => {
        await page.goto('/');
        const border = () =>
            page.locator('#navbar').evaluate(el => getComputedStyle(el).borderBottomColor);
        const top = await border();
        await page.evaluate(() => globalThis.scrollTo(0, 600));
        await expect(page.locator('#navbar')).toHaveClass(/scrolled/);
        // Polled: the colour transitions, so it settles a frame after the class lands
        await expect.poll(border).not.toBe(top);
    });
});

test.describe('lead project card', () => {
    test('shows the screenshot for the current theme and names what it shows', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('theme', 'light'));
        await page.goto('/');
        const lead = page.locator('.lead-card[data-project="health"]');
        await expect(lead).toBeVisible();

        const light = lead.locator('.shot--light img');
        await expect(light).toBeVisible();
        await expect(lead.locator('.shot--dark img')).toBeHidden();
        expect(await light.getAttribute('alt')).toMatch(/gait/i);
        // Reserved size, so the image loading can't shift the page
        await expect(light).toHaveAttribute('width', '1200');
        await expect(light).toHaveAttribute('height', '750');

        await page.locator('#theme-toggle').click();
        await expect(lead.locator('.shot--dark img')).toBeVisible();
        await expect(lead.locator('.shot--light img')).toBeHidden();
    });

    test('offers AVIF with a WebP fallback, and every file it names exists', async ({
        page,
        request,
    }) => {
        await page.goto('/');
        const urls = await page
            .locator('.lead-card picture')
            .evaluateAll(pictures =>
                pictures.flatMap(picture =>
                    [...picture.querySelectorAll('source, img')].flatMap(el =>
                        (el.getAttribute('srcset') ?? '')
                            .split(',')
                            .map(entry => entry.trim().split(' ')[0])
                    )
                )
            );
        expect(urls.length).toBeGreaterThan(0);
        for (const url of new Set(urls)) {
            expect((await request.get(url)).status(), url).toBe(200);
        }
    });

    test('opens its case study', async ({ page }) => {
        await page.goto('/');
        const lead = page.locator('.lead-card[data-project="health"]');

        const open = lead.locator('[data-case-study]');
        await expect(open).toBeVisible();
        await open.click();
        await expect(page.locator('#project-modal')).toHaveClass(/visible/);
    });
});

test.describe('images', () => {
    // Both themes' pictures are in the page and CSS hides one. If a rule ever un-hides it
    // (specificity), it is fetched for nothing, which is a real cost on a phone.
    for (const theme of ['light', 'dark']) {
        const other = theme === 'light' ? 'dark' : 'light';
        test(`the ${theme} theme never downloads the ${other} theme's project images`, async ({
            page,
        }) => {
            const requested = [];
            page.on('request', request => {
                if (request.url().includes('/images/projects/')) requested.push(request.url());
            });
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/');
            // Bring every card into view so every lazy image that is going to load, loads
            for (const card of await page.locator('#projects [data-project]').all()) {
                await card.scrollIntoViewIfNeeded();
            }
            await page.waitForLoadState('networkidle');

            expect(requested.filter(url => url.includes(`-${theme}`)).length).toBeGreaterThan(0);
            expect(requested.filter(url => url.includes(`-${other}`))).toEqual([]);
        });
    }
});
