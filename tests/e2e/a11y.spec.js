/**
 * Accessibility audit using axe-core (5.4)
 *
 * Scans the main page, the open Cmd-K palette modal, and the key sections
 * for WCAG 2.1 AA violations.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
