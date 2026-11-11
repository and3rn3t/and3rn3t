/**
 * Accessibility audit using axe-core (5.4)
 *
 * Scans the main page, the open Cmd-K palette modal, and the key sections
 * for WCAG 2.1 AA violations.
 */
import { test, expect } from './fixtures.js';
import AxeBuilder from '@axe-core/playwright';

/** WCAG contrast ratio of two [r, g, b] colours. */
function contrast(foreground, background) {
    const luminance = ([r, g, b]) => {
        const [lr, lg, lb] = [r, g, b].map(channel => {
            const v = channel / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

test.describe('Accessibility — main page', () => {
    test('has no critical axe violations on initial load', async ({ page }) => {
        await page.goto('/');
        // Let deferred modules settle.
        await page.waitForTimeout(1000);

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            // Skip third-party Cloudflare beacon iframe that we can't control.
            .exclude('iframe[src*="cloudflare"]')
            .analyze();

        expect(results.violations).toEqual([]);
    });

    // The design tokens have a light and a dark value each, so contrast is a per-theme question.
    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme, with the mobile menu open and closed`, async ({
            page,
        }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/');
            await page.waitForSelector(
                '#projects .lead-card [data-case-study]:not([data-pending])'
            );
            await page.waitForTimeout(500);

            const scan = () =>
                new AxeBuilder({ page })
                    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                    .exclude('iframe[src*="cloudflare"]')
                    .analyze();
            expect((await scan()).violations).toEqual([]);

            // The sheet only exists on narrow screens
            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('#mobile-menu').click();
            await expect(page.locator('#nav-menu')).toHaveClass(/active/);
            await page.waitForTimeout(400); // let the sheet finish fading in
            expect((await scan()).violations).toEqual([]);
        });
    }

    // axe checks a page at rest and cannot hover, so a hover state that drops below AA (a legacy
    // rule filling a button with the same green as its text) needs its own check.
    for (const theme of ['light', 'dark']) {
        test(`buttons stay readable on hover in the ${theme} theme`, async ({ page }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/');
            await page.waitForSelector(
                '#projects .lead-card [data-case-study]:not([data-pending])'
            );

            const buttons = {
                'hero action': '#home .button--primary',
                'lead card action': '#projects .lead-card .button--primary',
            };
            for (const [name, selector] of Object.entries(buttons)) {
                const button = page.locator(selector).first();
                await button.scrollIntoViewIfNeeded();
                await button.hover();
                await page.waitForTimeout(350); // past the hover transition

                const { color, background } = await button.evaluate(el => {
                    const style = getComputedStyle(el);
                    return { color: style.color, background: style.backgroundColor };
                });
                const [fgChannels, bgChannels] = [color, background].map(c =>
                    c.match(/[\d.]+/g).map(Number)
                );
                expect(bgChannels[3] ?? 1, `${name} has a solid hover background`).toBe(1);
                expect(
                    contrast(fgChannels, bgChannels),
                    `${name}: ${color} on ${background}`
                ).toBeGreaterThanOrEqual(4.5);
            }
        });
    }

    // The case-study modal sits under a backdrop, so axe cannot determine its background and
    // reports contrast as "incomplete" rather than failing it. Measure the buttons directly.
    for (const theme of ['light', 'dark']) {
        test(`the case-study modal's buttons are readable at rest and on hover in the ${theme} theme`, async ({
            page,
        }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await page.goto('/');
            await page.waitForSelector(
                '#projects .lead-card [data-case-study]:not([data-pending])'
            );
            await page.locator('#projects .lead-card [data-case-study]').click();
            await page.waitForSelector('#project-modal.visible');
            await page.waitForTimeout(600); // past the modal's own transition

            const read = async button => {
                const { color, background } = await button.evaluate(el => {
                    const style = getComputedStyle(el);
                    return { color: style.color, background: style.backgroundColor };
                });
                const [fg, bg] = [color, background].map(c => c.match(/[\d.]+/g).map(Number));
                return { fg, bg, text: `${color} on ${background}` };
            };

            const buttons = {
                'View Code': '#project-modal .project-link:not(.live)',
                'Live Demo': '#project-modal .project-link.live',
            };
            for (const [name, selector] of Object.entries(buttons)) {
                const button = page.locator(selector).first();
                await expect(button, `${name} is in the modal`).toBeVisible();

                await page.mouse.move(0, 0);
                await page.waitForTimeout(350);
                const rest = await read(button);
                // A transparent button sits on the modal's own background, which is not
                // measurable here; the solid ones are.
                if ((rest.bg[3] ?? 1) === 1) {
                    expect(
                        contrast(rest.fg, rest.bg),
                        `${name} at rest: ${rest.text}`
                    ).toBeGreaterThanOrEqual(4.5);
                }

                await button.hover();
                await page.waitForTimeout(350);
                const hover = await read(button);
                expect(hover.bg[3] ?? 1, `${name} has a solid hover background`).toBe(1);
                expect(
                    contrast(hover.fg, hover.bg),
                    `${name} on hover: ${hover.text}`
                ).toBeGreaterThanOrEqual(4.5);
            }
        });
    }

    test('command palette modal is accessible when open', async ({ page }) => {
        await page.goto('/');
        // Ensure the palette manager has attached its global shortcut before pressing.
        await page
            .waitForFunction(() => Boolean(globalThis.appState?.managers?.palette), {
                timeout: 10000,
            })
            .catch(() => {});
        await page.keyboard.press('Control+k');
        await page.waitForSelector('#global-search-modal.visible');
        // Wait out the fade/slide-in (250ms modal fade + 350ms content slide) —
        // axe blends mid-transition opacity into composited colors and reports
        // false contrast failures. The fixed wait covers the transition window
        // even when the transition engages a frame after .visible lands.
        await page.waitForTimeout(700);
        await page.waitForFunction(() => {
            const modal = document.querySelector('#global-search-modal');
            return modal && getComputedStyle(modal).opacity === '1';
        });

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .include('#global-search-modal')
            .analyze();

        expect(results.violations).toEqual([]);
    });
});
