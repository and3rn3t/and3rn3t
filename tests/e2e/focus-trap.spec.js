/**
 * Keyboard focus in the modal dialogs (the keyboard shortcuts here, the command palette in
 * palette.spec.js).
 *
 * Both are native <dialog>s opened with showModal(), so the browser makes the rest of the page
 * inert. That is a different guarantee from the hand-written trap they replace: Tab past the last
 * control hands focus to the browser's own UI (the address bar) instead of wrapping to the first,
 * so the test is that focus is never on the page behind, not that it wraps.
 *
 * History: the old trap treated every `[href]` as focusable, and an icon is <svg><use href="...">,
 * so the "last focusable element" was an invisible icon and Tab never wrapped; it also called
 * `.at()` on a NodeList, which threw on every Tab. Neither can happen now: there is no trap code.
 */
import { test, expect } from './fixtures.js';

/**
 * Where focus is: inside `selector`, or on nothing in the page (document.body, which is what it
 * is while the browser's own UI has it). Anything else is a page element behind the dialog.
 */
const focusPlace = (page, selector) =>
    page.evaluate(sel => {
        const el = document.activeElement;
        return {
            ok: !el || el === document.body || Boolean(el.closest(sel)),
            label: `${el?.tagName?.toLowerCase()}.${String(el?.className).slice(0, 30)}`,
        };
    }, selector);

/** Press `key` `times` times and assert focus never reaches the page behind `selector`. */
async function expectContained(page, selector, key, times) {
    const seen = [];
    for (let i = 1; i <= times; i++) {
        await page.keyboard.press(key);
        const { ok, label } = await focusPlace(page, selector);
        seen.push(label);
        expect(ok, `${key} #${i} reached the page behind. Order so far: ${seen.join(' -> ')}`).toBe(
            true
        );
    }
    return seen;
}

test.describe('keyboard shortcuts panel', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.waitForFunction(() => Boolean(globalThis.appState?.managers?.keyboardHelp));
        await page.evaluate(() => document.activeElement?.blur()); // no field has focus (a click on the body's centre can land in the contact form)
        await page.keyboard.press('?');
        await expect(page.locator('#keyboard-help')).toHaveAttribute('open', '');
        await expect(page.locator('#keyboard-help-close')).toBeFocused();
    });

    test('Tab never reaches the page behind the dialog', async ({ page }) => {
        await expectContained(page, '#keyboard-help', 'Tab', 6);
    });

    test('Shift+Tab never reaches the page behind the dialog', async ({ page }) => {
        await expectContained(page, '#keyboard-help', 'Shift+Tab', 6);
    });

    test('the page behind is inert: it cannot take focus', async ({ page }) => {
        const reached = await page.evaluate(() => {
            const behind = document.querySelector('.site-nav a, main a');
            behind.focus();
            return document.activeElement === behind;
        });
        expect(reached).toBe(false);
    });

    test('Escape closes it and returns focus to where it was', async ({ page }) => {
        await page.keyboard.press('Escape');
        await expect(page.locator('#keyboard-help')).not.toHaveAttribute('open');
        await expect(page.locator('body')).toBeFocused();
    });
});
