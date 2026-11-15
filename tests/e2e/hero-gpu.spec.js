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

// The hero only starts on a device that passes capabilities.js's low-end check (more than 4 cores
// and more than 4 GB), and a CI runner does not, so without this the field never mounts there and
// every test below waits for nothing. These tests are about the field, not about that check.
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    });
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

test.describe('with ?hero=gpu on an adapter that cannot present to a canvas', () => {
    // Chromium's software WebGPU (what a CI runner has) has an adapter and a device, but every canvas's
    // getCurrentTexture() is invalid, so a field mounted there would draw nothing. It must fall back.
    test('falls back to the WASM field instead of mounting a hero that draws nothing', async ({
        page,
    }) => {
        await page.addInitScript(() => {
            if (!window.GPUCanvasContext) return; // no WebGPU here: the fallback test above covers it
            window.GPUCanvasContext.prototype.getCurrentTexture = () => {
                throw new DOMException('no swapchain', 'InvalidStateError');
            };
        });
        await page.goto('/?hero=gpu');
        await page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
            timeout: 15000,
        });
        const state = await page.evaluate(() => {
            const canvas = document.getElementById('hero-canvas');
            return {
                active: canvas.classList.contains('is-active'),
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

test.describe('the hero seed', () => {
    const seedOf = page =>
        page.evaluate(() => globalThis.appState.managers.heroCanvas.seed ?? null);
    const ready = page =>
        page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
            timeout: 15000,
        });

    test('is 0, the field the site always drew, on a plain visit', async ({ page }) => {
        await page.goto('/');
        await ready(page);
        expect(await seedOf(page)).toBe(0);
    });

    test('?seed= picks a picture, and the daily switch picks the UTC day', async ({ page }) => {
        await page.goto('/?seed=flow');
        await ready(page);
        const flow = await seedOf(page);
        expect(flow).toBeGreaterThan(0);

        await page.addInitScript(() => localStorage.setItem('lab', 'hero-seed'));
        await page.goto('/');
        await ready(page);
        expect(await seedOf(page)).toBe(Math.floor(Date.now() / 86_400_000) + 1);
    });

    test('the GPU field takes the same seed and runs with no WebGPU error', async ({ page }) => {
        const problems = [];
        page.on('console', message => {
            if (/GPU|WebGPU|bind ?group|pipeline|uniform|buffer/i.test(message.text())) {
                problems.push(message.text().slice(0, 300));
            }
        });
        await page.goto('/?hero=gpu&seed=flow');
        await ready(page);
        const stats = await page.evaluate(() => globalThis.appState.managers.heroCanvas.stats?.());
        test.skip(stats?.kind !== 'gpu', 'no WebGPU adapter here (CI has none)');
        const wasm = await page
            .goto('/?seed=flow')
            .then(() => ready(page).then(() => seedOf(page)));
        expect(stats.seed).toBe(wasm);
        expect(problems).toEqual([]);
    });
});

test.describe('HDR (the `hero-hdr` switch)', () => {
    /** Make the page believe the display is HDR: headless Chromium's never is. */
    const pretendHdr = page =>
        page.addInitScript(() => {
            const real = window.matchMedia.bind(window);
            window.matchMedia = query =>
                query.includes('dynamic-range: high')
                    ? {
                          matches: true,
                          media: query,
                          addEventListener() {},
                          removeEventListener() {},
                      }
                    : real(query);
        });
    const gpuStats = async (page, url) => {
        await page.goto(url);
        await page.waitForFunction(() => globalThis.appState?.managers?.heroCanvas, null, {
            timeout: 15000,
        });
        const stats = await page.evaluate(() => globalThis.appState.managers.heroCanvas.stats?.());
        test.skip(stats?.kind !== 'gpu', 'no WebGPU adapter here (CI has none)');
        return stats;
    };

    test('stays off unless asked for, even on an HDR display', async ({ page }) => {
        await pretendHdr(page);
        expect((await gpuStats(page, '/?hero=gpu')).hdr).toBe(false);
    });

    test('stays off on an ordinary display even when asked for', async ({ page }) => {
        expect((await gpuStats(page, '/?lab=hero-gpu,hero-hdr')).hdr).toBe(false);
    });

    test('on an HDR display it draws into a float canvas with extended tone mapping, no error', async ({
        page,
    }) => {
        const problems = [];
        page.on('console', message => {
            if (/GPU|WebGPU|bind ?group|pipeline|uniform|buffer|texture/i.test(message.text())) {
                problems.push(message.text().slice(0, 300));
            }
        });
        await pretendHdr(page);
        const stats = await gpuStats(page, '/?lab=hero-gpu,hero-hdr&particles=20000');
        // A browser that cannot keep the tone mapping must say so by falling back, not draw clamped
        test.skip(!stats.hdr, 'this browser does not keep extended tone mapping');
        const config = await page.evaluate(() => {
            const { format, toneMapping } = document
                .getElementById('hero-canvas')
                .getContext('webgpu')
                .getConfiguration();
            return { format, mode: toneMapping.mode };
        });
        expect(config).toEqual({ format: 'rgba16float', mode: 'extended' });
        await expect
            .poll(() => page.evaluate(() => globalThis.appState.managers.heroCanvas.stats().fps))
            .toBeGreaterThan(20);
        expect(problems).toEqual([]);
    });
});
