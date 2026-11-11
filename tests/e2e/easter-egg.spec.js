/**
 * The hidden developer-mode terminal (the Konami code, modules/easter-egg.js). It is made by
 * script and styled only by styles/home.css, so it needs its own test: nothing else on the page
 * renders it, and when its styles were lost in the move off the old stylesheet nothing failed.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const SEQUENCE = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
];

/** The module starts when the browser is idle; press the code until it answers. */
async function openTerminal(page) {
    await page.goto('/');
    await page.evaluate(() => document.activeElement?.blur());
    await expect
        .poll(
            async () => {
                for (const key of SEQUENCE) await page.keyboard.press(key);
                return page.locator('.dev-terminal-overlay').count();
            },
            { timeout: 12000 }
        )
        .toBe(1);
    await expect(page.locator('.dev-terminal-overlay')).toHaveClass(/visible/);
}

const channels = colour => colour.match(/[\d.]+/g).map(Number);
const luminance = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

for (const theme of ['light', 'dark']) {
    test.describe(`in the ${theme} theme`, () => {
        test.beforeEach(async ({ page }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
        });

        test('is a centred overlay over the page, not a block under the footer', async ({
            page,
        }) => {
            await openTerminal(page);
            const viewport = page.viewportSize();
            const overlay = await page.locator('.dev-terminal-overlay').boundingBox();
            expect(overlay.x).toBe(0);
            expect(overlay.y).toBe(0);
            expect(overlay.width).toBe(viewport.width);
            expect(overlay.height).toBe(viewport.height);
            expect(
                await page
                    .locator('.dev-terminal-overlay')
                    .evaluate(el => getComputedStyle(el).position)
            ).toBe('fixed');

            const panel = await page.locator('.dev-terminal').boundingBox();
            expect(panel.width).toBeLessThanOrEqual(560);
            expect(Math.abs(panel.x + panel.width / 2 - viewport.width / 2)).toBeLessThan(2);
            expect(panel.y).toBeGreaterThanOrEqual(0);
            expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height);
        });

        test('is always a dark terminal, with green text, whatever the page theme', async ({
            page,
        }) => {
            await openTerminal(page);
            const style = await page.locator('.dev-terminal').evaluate(el => {
                const body = el.querySelector('.dev-terminal-body');
                return {
                    background: getComputedStyle(el).backgroundColor,
                    text: getComputedStyle(body).color,
                };
            });
            expect(luminance(channels(style.background))).toBeLessThan(0.12);
            // The dark theme's accent, #4ade80
            expect(channels(style.text).slice(0, 3)).toEqual([74, 222, 128]);
        });

        test('types its lines out, shows the hint, and has no leftover legacy look', async ({
            page,
        }) => {
            await openTerminal(page);
            await expect(page.locator('#dev-terminal-body')).toContainText('whoami');
            await expect(page.locator('.dev-terminal-hint kbd')).toHaveText('Esc');
            // The three window dots are laid out as dots, not collapsed text
            const dots = await page.locator('.dev-dot').evaluateAll(els =>
                els.map(el => {
                    const rect = el.getBoundingClientRect();
                    return [Math.round(rect.width), Math.round(rect.height)];
                })
            );
            expect(dots).toEqual([
                [12, 12],
                [12, 12],
                [12, 12],
            ]);
        });

        test('has no axe violations', async ({ page }) => {
            await openTerminal(page);
            await page.waitForTimeout(400);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .include('.dev-terminal-overlay')
                .analyze();
            expect(results.violations).toEqual([]);
        });
    });
}

test('Esc closes it and removes it from the page', async ({ page }) => {
    await openTerminal(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.dev-terminal-overlay')).toHaveCount(0);
});

test('a click on the backdrop closes it, a click inside does not', async ({ page }) => {
    await openTerminal(page);
    await page.locator('.dev-terminal-body').click();
    await expect(page.locator('.dev-terminal-overlay')).toHaveCount(1);

    await page.mouse.click(3, 3); // the backdrop, outside the panel
    await expect(page.locator('.dev-terminal-overlay')).toHaveCount(0);
});

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('fits the screen', async ({ page }) => {
        await openTerminal(page);
        const panel = await page.locator('.dev-terminal').boundingBox();
        expect(panel.x).toBeGreaterThanOrEqual(0);
        expect(panel.x + panel.width).toBeLessThanOrEqual(390);
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth - globalThis.innerWidth)
        ).toBeLessThanOrEqual(0);
    });
});
