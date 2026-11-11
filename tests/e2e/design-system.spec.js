/**
 * The design system's contract: cascade layers, theme, navigation chrome and the lead card.
 */
import { test, expect } from './fixtures.js';

const rootVar = (page, name) =>
    page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test.describe('cascade layers', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    // The home page makes the shared scale a step tighter on phones (home.css, in the `scale`
    // layer). The values are what the page was designed and reviewed at, so they are pinned.
    test("the home page's phone scale is a step tighter than the desktop scale", async ({
        page,
    }) => {
        await page.goto('/');
        expect(await rootVar(page, '--space-10')).toBe('2rem');
        expect(await rootVar(page, '--space-8')).toBe('1.5rem');
        expect(await rootVar(page, '--space-24')).toBe('5rem');
        expect(await rootVar(page, '--font-size-base')).toMatch(/^clamp\(/);
    });

    test('a page that loads only core.css keeps the desktop scale on a phone', async ({ page }) => {
        await page.goto('/projects/health/');
        expect(await rootVar(page, '--space-10')).toBe('2.5rem');
        expect(await rootVar(page, '--font-size-base')).toBe('1rem');
    });
});

test('the home page needs no stylesheet but core.css and home.css', async ({ page }) => {
    const sheets = [];
    page.on('request', request => {
        if (request.resourceType() === 'stylesheet') sheets.push(new URL(request.url()).pathname);
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(sheets.sort()).toEqual(['/styles/core.css', '/styles/home.css']);
    expect((await page.request.get('/styles.css')).status()).toBe(404);
});

test('the layer order is declared before any layer is used', async ({ page }) => {
    await page.goto('/');
    const first = await page.evaluate(() => document.querySelector('head style').textContent);
    expect(first).toMatch(/@layer scale, reset, tokens, base, components, sections, utilities;/);
});

test.describe('theme', () => {
    test('sets <html data-theme> before first paint, from the saved choice', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
        await page.goto('/', { waitUntil: 'commit' });
        // The head script runs before the body exists, so the attribute is there at commit
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        // color-scheme comes from the stylesheet, which is render-blocking: it resolves once
        // that arrives, still before anything is painted. Polled, because at commit it has not.
        await expect
            .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme))
            .toBe('dark');
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
        // Polled: a colour change can take a frame to settle, so read it until it does
        // one-frame transition, so the value settles on the next frame.
        await expect.poll(background).toBe('rgb(11, 13, 11)'); // --surface, dark
    });
});

test.describe('home sections', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    // Every home section is built from .section and .section-heading*, which core.css owns. If
    // those rules go missing the sections fall back to browser defaults and nothing else fails.
    test('keep the design system spacing, hairline and heading type', async ({ page }) => {
        await page.goto('/');
        const sections = await page.locator('main section.section').count();
        expect(sections).toBeGreaterThanOrEqual(5);

        const expected = await page.evaluate(() => {
            const probe = (property, value) => {
                const el = document.createElement('div');
                el.style[property] = value;
                document.body.append(el);
                const resolved = getComputedStyle(el)[property];
                el.remove();
                return resolved;
            };
            return {
                padding: probe('paddingTop', 'var(--space-24)'),
                title: probe('fontSize', 'var(--font-size-title)'),
                lede: probe('fontSize', 'var(--font-size-lg)'),
            };
        });

        const actual = await page.evaluate(() => {
            const style = (selector, ...properties) => {
                const computed = getComputedStyle(document.querySelector(selector));
                return Object.fromEntries(properties.map(name => [name, computed[name]]));
            };
            return {
                section: style('#about.section', 'paddingTop', 'paddingBottom', 'borderTopWidth'),
                title: style('#about .section-heading__title', 'fontSize', 'marginTop'),
                lede: style('#projects .section-heading__lede', 'fontSize'),
            };
        });

        expect(actual.section.paddingTop).toBe(expected.padding);
        expect(actual.section.paddingBottom).toBe(expected.padding);
        expect(actual.section.borderTopWidth).toBe('1px');
        expect(actual.title.fontSize).toBe(expected.title);
        expect(actual.title.marginTop).toBe('0px');
        expect(actual.lede.fontSize).toBe(expected.lede);
    });
});

test.describe('navigation chrome', () => {
    test('the search button opens the command palette', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => Boolean(globalThis.appState?.managers?.palette));
        await page.locator('.site-nav__search').click();
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
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

    test('leads to its project page', async ({ page }) => {
        await page.goto('/');
        const lead = page.locator('.lead-card[data-project="health"]');

        const open = lead.locator('a[href="/projects/health/"]').first();
        await expect(open).toBeVisible();
        await open.click();
        await page.waitForURL('**/projects/health/');
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
