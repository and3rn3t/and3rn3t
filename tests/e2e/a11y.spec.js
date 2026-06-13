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
        await page.keyboard.press('Control+k');
        await page.waitForSelector('#global-search-modal.visible');

        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .include('#global-search-modal')
            .analyze();

        expect(results.violations).toEqual([]);
    });
});
