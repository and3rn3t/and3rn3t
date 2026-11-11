/**
 * Focus traps in the modal dialogs (the keyboard shortcuts panel here, the command palette in
 * palette.spec.js).
 *
 * Regressions: the trap code treated every `[href]` as focusable, and an icon is
 * <svg><use href="...">, so the "last focusable element" was an invisible icon and Tab off
 * the real last control never wrapped. The keyboard-shortcuts panel also called `.at()` on a
 * NodeList, which threw on every Tab. (The command palette's trap is tested in palette.spec.js.)
 */
import { test, expect } from './fixtures.js';

const focusInside = (page, selector) =>
    page.evaluate(sel => {
        const el = document.activeElement;
        return {
            inside: Boolean(el?.closest(sel)),
            label: `${el?.tagName?.toLowerCase()}.${String(el?.className).slice(0, 30)}`,
        };
    }, selector);

/** Press `key` `times` times and assert focus never leaves `selector`. */
async function expectTrapped(page, selector, key, times) {
    const seen = [];
    for (let i = 1; i <= times; i++) {
        await page.keyboard.press(key);
        const { inside, label } = await focusInside(page, selector);
        seen.push(label);
        expect(inside, `${key} #${i} left the dialog. Order so far: ${seen.join(' -> ')}`).toBe(
            true
        );
    }
    return seen;
}

test.describe('keyboard shortcuts panel', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => Boolean(globalThis.appState?.managers?.keyboardHelp));
        await page.locator('body').click();
        await page.keyboard.press('?');
        await expect(page.locator('#keyboard-help')).toHaveClass(/visible/);
        await expect(page.locator('#keyboard-help-close')).toBeFocused();
    });

    test('Tab keeps focus inside the panel', async ({ page }) => {
        await expectTrapped(page, '#keyboard-help', 'Tab', 6);
        await expect(page.locator('#keyboard-help-close')).toBeFocused();
    });

    test('Shift+Tab keeps focus inside the panel', async ({ page }) => {
        await expectTrapped(page, '#keyboard-help', 'Shift+Tab', 6);
    });

    test('Escape closes it and returns focus to where it was', async ({ page }) => {
        await page.keyboard.press('Escape');
        await expect(page.locator('#keyboard-help')).not.toHaveClass(/visible/);
        await expect(page.locator('body')).toBeFocused();
    });
});
