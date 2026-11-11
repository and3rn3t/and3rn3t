/**
 * Startup budgets for the home page, and the guarantee that deferring features does not make a
 * visitor wait for them.
 *
 * "Ready" is the `app:ready` event, when the theme, menu, navigation and UI shell are running (see
 * main.js). Everything else starts on its own afterwards, so the cost that matters for first paint
 * is what was fetched by then. "Settled" is after the deferred features have had time to start.
 *
 * Sizes are encoded body sizes from the Resource Timing API. The budgets are the plan's targets,
 * with room above today's numbers (9 files / 49 KB at ready), so they catch a regression and not
 * noise.
 */
import { test, expect } from './fixtures.js';

const KB = 1024;

/** Scripts fetched so far, as [file, bytes]. */
const scripts = page =>
    page.evaluate(() =>
        performance
            .getEntriesByType('resource')
            .filter(entry => new URL(entry.name).pathname.endsWith('.js'))
            .map(entry => [new URL(entry.name).pathname, entry.encodedBodySize])
    );

/** The same, as it stood the moment `app:ready` fired (recorded by the init script). */
const recordAtReady = page =>
    page.addInitScript(() => {
        globalThis.addEventListener('app:ready', () => {
            globalThis.__atReady = performance
                .getEntriesByType('resource')
                .filter(entry => new URL(entry.name).pathname.endsWith('.js'))
                .map(entry => [new URL(entry.name).pathname, entry.encodedBodySize]);
        });
    });

const total = list => list.reduce((sum, [, bytes]) => sum + bytes, 0);

test.describe('startup budgets', () => {
    test('what is needed to be ready is small: at most 12 script files and 70 KB', async ({
        page,
    }) => {
        await recordAtReady(page);
        await page.goto('/');
        await page.waitForFunction(() => globalThis.__atReady);
        const atReady = await page.evaluate(() => globalThis.__atReady);

        const names = atReady.map(([name]) => name.split('/').pop());
        expect(atReady.length, `at ready: ${names.join(' ')}`).toBeLessThanOrEqual(12);
        expect(total(atReady), `at ready: ${names.join(' ')}`).toBeLessThanOrEqual(70 * KB);
    });

    test('the optional features are not part of getting ready', async ({ page }) => {
        await recordAtReady(page);
        await page.goto('/');
        await page.waitForFunction(() => globalThis.__atReady);
        const atReady = (await page.evaluate(() => globalThis.__atReady)).map(([name]) => name);

        for (const feature of [
            'command-palette.js',
            'keyboard-help.js',
            'contact-form.js',
            'currently.js',
            'views.js',
            'easter-egg.js',
            'legacy-links.js',
            'hero-sim.js',
        ]) {
            expect(
                atReady.some(name => name.endsWith(`/${feature}`)),
                `${feature} was fetched before the app was ready`
            ).toBe(false);
        }
    });

    test('everything still starts: no feature is lost by deferring it', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(
            () => {
                const managers = globalThis.appState?.managers ?? {};
                return ['palette', 'keyboardHelp', 'contactForm', 'contactTabs'].every(
                    name => managers[name]
                );
            },
            undefined,
            { timeout: 10000 }
        );
    });

    test('the settled page stays within bounds, with no layout shift', async ({ page }) => {
        await page.addInitScript(() => {
            globalThis.__cls = 0;
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput) globalThis.__cls += entry.value;
                }
            }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto('/');
        await page.waitForTimeout(6000); // past the longest deferral
        const settled = await scripts(page);
        expect(settled.length).toBeLessThanOrEqual(28);
        expect(total(settled)).toBeLessThanOrEqual(130 * KB);
        expect(await page.evaluate(() => globalThis.__cls)).toBeLessThanOrEqual(0.01);
    });

    test('a page with no hash never loads the legacy-link redirect', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(3000);
        expect((await scripts(page)).some(([name]) => name.endsWith('/legacy-links.js'))).toBe(
            false
        );
    });
});

test.describe('shortcuts used before their module has loaded', () => {
    // Hold a module back, so the page is ready but the feature is not, then use it
    const delay = (page, file, ms = 1500) =>
        page.route(`**/modules/${file}`, async route => {
            await new Promise(resolve => setTimeout(resolve, ms));
            await route.continue();
        });

    test('Ctrl+K loads the palette and then opens it', async ({ page }) => {
        await delay(page, 'command-palette.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        expect(await page.evaluate(() => Boolean(globalThis.appState.managers.palette))).toBe(
            false
        );

        await page.keyboard.press('Control+k');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '', {
            timeout: 8000,
        });
        await expect(page.locator('#global-search-input')).toBeFocused();

        // From here the palette handles its own keys: Ctrl+K again closes it, once
        await page.keyboard.press('Control+k');
        await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
    });

    test('the search button in the nav loads the palette and then opens it', async ({ page }) => {
        await delay(page, 'command-palette.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.locator('.site-nav__search').click();
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '', {
            timeout: 8000,
        });
    });

    test('? loads keyboard help and then opens it', async ({ page }) => {
        await delay(page, 'keyboard-help.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.evaluate(() => document.activeElement?.blur()); // no field has focus (a click on the body's centre can land in the contact form)
        await page.keyboard.press('?');
        await expect(page.locator('#keyboard-help')).toHaveAttribute('open', '', {
            timeout: 8000,
        });
    });

    test('g then c jumps to Contact without waiting for keyboard help to load', async ({
        page,
    }) => {
        await delay(page, 'keyboard-help.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        expect(await page.evaluate(() => Boolean(globalThis.appState.managers.keyboardHelp))).toBe(
            false
        );
        await page.evaluate(() => document.activeElement?.blur());

        await page.keyboard.press('g');
        await page.keyboard.press('c');
        await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('contact');
        // ...and it was not waiting for the module
        expect(await page.evaluate(() => Boolean(globalThis.appState.managers.keyboardHelp))).toBe(
            false
        );
    });

    test('the g prefix survives the module loading between the two keys', async ({ page }) => {
        // Short enough that the module arrives inside the 1.2 s window after the g
        await delay(page, 'keyboard-help.js', 300);
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.evaluate(() => document.activeElement?.blur());

        await page.keyboard.press('g');
        // Wait until the module has loaded and started, then finish the sequence
        await page.waitForFunction(() => globalThis.appState.managers.keyboardHelp, undefined, {
            timeout: 8000,
        });
        await page.keyboard.press('c');
        await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('contact');
    });

    test('the g prefix expires, so a later c does nothing', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('g');
        await page.waitForTimeout(1500); // longer than the 1.2 s window
        await page.keyboard.press('c');
        await page.waitForTimeout(300);
        expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('contact');
    });

    test('g is left alone while the palette is open', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.managers?.palette);
        await page.keyboard.press('Control+k');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
        await page.locator('.search-category[data-category="all"]').focus(); // not a text field
        await page.keyboard.press('g');
        await page.keyboard.press('c');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
        expect(await page.evaluate(() => document.activeElement?.id ?? '')).not.toBe('contact');
    });

    test('? while the palette is open does not open help on top of it, even after help loads', async ({
        page,
    }) => {
        await delay(page, 'keyboard-help.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.managers?.palette);
        expect(await page.evaluate(() => Boolean(globalThis.appState.managers.keyboardHelp))).toBe(
            false
        );
        await page.keyboard.press('Control+k');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
        await page.locator('.search-category[data-category="all"]').focus();
        await page.keyboard.press('?');

        // Give the delayed module time to arrive and be asked to open
        await page.waitForFunction(() => globalThis.appState.managers.keyboardHelp, undefined, {
            timeout: 8000,
        });
        await page.waitForTimeout(300);
        await expect(page.locator('#keyboard-help')).not.toHaveAttribute('open');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
    });

    test('a palette opened while help is loading wins: help does not open over it on arrival', async ({
        page,
    }) => {
        await delay(page, 'keyboard-help.js', 1200);
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.managers?.palette);
        await page.evaluate(() => document.activeElement?.blur());

        await page.keyboard.press('?'); // nothing is open yet, so help is requested...
        await page.keyboard.press('Control+k'); // ...and the palette opens before it arrives
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');

        await page.waitForFunction(() => globalThis.appState.managers.keyboardHelp, undefined, {
            timeout: 8000,
        });
        await page.waitForTimeout(300);
        await expect(page.locator('#keyboard-help')).not.toHaveAttribute('open');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
    });

    test('a ? pressed while help is still loading opens it once it has, when nothing else is open', async ({
        page,
    }) => {
        await delay(page, 'keyboard-help.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.evaluate(() => document.activeElement?.blur());
        await page.keyboard.press('?');
        await expect(page.locator('#keyboard-help')).toHaveAttribute('open', '', { timeout: 8000 });
    });

    test('a shortcut typed in a text field is left alone', async ({ page }) => {
        await delay(page, 'command-palette.js');
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.locator('#contact-form [name="name"]').scrollIntoViewIfNeeded();
        await page.locator('#contact-form [name="name"]').fill('a/b?');
        expect(await page.locator('#contact-form [name="name"]').inputValue()).toBe('a/b?');
        await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
        await expect(page.locator('#keyboard-help')).not.toHaveAttribute('open');
    });
});

test.describe('legacy links still redirect', () => {
    test('#post/<slug> and #project/<slug> load the redirect when they are used', async ({
        page,
    }) => {
        await page.goto('/#project/health');
        await page.waitForURL('**/projects/health/');
    });

    test('a hash set after the page loads is handled too', async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.evaluate(() => {
            globalThis.location.hash = '#project/homehub';
        });
        await page.waitForURL('**/projects/homehub/');
    });
});

test.describe('features that wait for their section', () => {
    // The fallback must be a real delay: requestIdleCallback's timeout is a deadline, so using it
    // would start the contact form's script at the first idle moment whatever the page showed.
    test('the contact form is not loaded just because the browser is idle', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        await page.waitForTimeout(1500); // many idle periods, well inside the 4 s fallback
        const loaded = (await scripts(page)).some(([name]) => name.endsWith('/contact-form.js'));
        const near = await page.evaluate(() => {
            const rect = document.getElementById('contact').getBoundingClientRect();
            return rect.top < globalThis.innerHeight + 800;
        });
        // Only started if Contact really is within 800px of the first screen
        expect(loaded).toBe(near);
    });

    test('and it does load once the section is near, without waiting out the fallback', async ({
        page,
    }) => {
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.isInitialized);
        const started = Date.now();
        await page.locator('#contact').scrollIntoViewIfNeeded();
        await page.waitForFunction(() => globalThis.appState.managers.contactForm, undefined, {
            timeout: 3000,
        });
        expect(Date.now() - started).toBeLessThan(3500);
    });

    test('and it still loads if the visitor never scrolls there, after the fallback', async ({
        page,
    }) => {
        await page.setViewportSize({ width: 390, height: 600 });
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState.managers.contactForm, undefined, {
            timeout: 10000,
        });
    });
});
