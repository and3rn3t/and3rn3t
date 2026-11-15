/**
 * The GPU hero (modules/hero-gpu.js), an opt-in experiment: `?hero=gpu`.
 *
 * The default page must not know it exists, a browser without a usable WebGPU adapter must fall
 * back to the WASM field on the same canvas, and where there is a GPU the field must run in both
 * themes without a WebGPU validation error. Chromium is started with the WebGPU flags for the whole
 * file (they cannot be set per group). CI has no GPU, so there the browser reports no adapter and
 * the GPU tests skip; the fallback test does not depend on that, it removes the adapter itself.
 */
import { test, expect } from './fixtures.js';

/** Frames a page runs with the heavy effects on: the e2e config forces reduced motion otherwise. */
const MOTION = { reducedMotion: 'no-preference' };

test.use({
    ...MOTION,
    launchOptions: {
        args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPU', '--use-angle=metal'],
    },
});

test.describe('without the flag', () => {
    test('the page never loads the GPU module', async ({ page }) => {
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/');
        await page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
            timeout: 15000,
        });
        expect(requested.filter(path => path.includes('hero-gpu'))).toEqual([]);
        expect(requested.some(path => path.includes('hero-sim'))).toBe(true); // the WASM field
    });
});

test.describe('with ?hero=gpu in a browser that has no usable adapter', () => {
    test('falls back to the WASM field, and the canvas is still a 2D canvas', async ({ page }) => {
        // However this machine is set up, the browser says there is no GPU to use
        await page.addInitScript(() => {
            if (navigator.gpu) navigator.gpu.requestAdapter = async () => null;
        });
        await page.goto('/?hero=gpu');
        await page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
            timeout: 15000,
        });
        const state = await page.evaluate(async () => {
            const canvas = document.getElementById('hero-canvas');
            return {
                active: canvas.classList.contains('is-active'),
                // A canvas that had been given a WebGPU context would answer null here
                twoD: Boolean(canvas.getContext('2d')),
                kind: globalThis.appState.managers.heroCanvas.stats?.().kind ?? 'wasm',
            };
        });
        expect(state).toMatchObject({ active: true, twoD: true, kind: 'wasm' });
    });
});

test.describe('with a GPU', () => {
    for (const theme of ['light', 'dark']) {
        test(`runs the field in the ${theme} theme with no WebGPU error`, async ({ page }) => {
            const problems = [];
            page.on('console', message => {
                const text = message.text();
                if (text.includes('[hero-gpu]') || /GPU|WebGPU|bind ?group|pipeline/i.test(text)) {
                    problems.push(text.slice(0, 300));
                }
            });
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/?hero=gpu');
            await page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
                timeout: 15000,
            });
            const kind = await page.evaluate(
                () => globalThis.appState.managers.heroCanvas.stats?.().kind ?? 'wasm'
            );
            test.skip(
                kind !== 'gpu',
                'no WebGPU adapter here (CI has none): the fallback test covers it'
            );

            await expect
                .poll(() =>
                    page.evaluate(() => globalThis.appState.managers.heroCanvas.stats().fps)
                )
                .toBeGreaterThan(20);
            // It is drawing, and moving: two looks at the hero a moment apart are not the same
            const hero = page.locator('#home');
            const first = await hero.screenshot();
            await page.waitForTimeout(1200);
            expect((await hero.screenshot()).equals(first)).toBe(false);
            expect(problems).toEqual([]);
        });
    }

    test('draws the number of particles it is asked for, up to a million', async ({ page }) => {
        await page.goto('/?hero=gpu&particles=250000');
        await page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
            timeout: 15000,
        });
        const stats = await page.evaluate(() => globalThis.appState.managers.heroCanvas.stats?.());
        test.skip(stats?.kind !== 'gpu', 'no WebGPU adapter here (CI has none)');
        expect(stats.particles).toBe(250000);
    });
});
