/**
 * Focus traps in the modal dialogs.
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

test.describe('project case-study modal', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        const card = page.locator('[data-case-study]').first();
        await card.waitFor();
        test.skip((await card.count()) === 0, 'no project with a case study in current data');
        await card.click();
        await expect(page.locator('#project-modal')).toHaveClass(/visible/);
        // Focus moves to the close button a frame after opening, and the footer links stay
        // visibility:hidden (so not focusable) until the open transition has run.
        await expect(page.locator('.project-modal-close')).toBeFocused();
        await expect(page.locator('.project-modal-links a').first()).toBeVisible();
        await page.waitForFunction(
            () =>
                getComputedStyle(document.querySelector('.project-modal-links a')).visibility ===
                'visible'
        );
    });

    test('Tab cycles through the dialog and wraps from the last link to the close button', async ({
        page,
    }) => {
        const links = await page.locator('.project-modal-links a').count();
        const seen = await expectTrapped(page, '#project-modal', 'Tab', (links + 1) * 2);
        // After a full lap it is back on the close button.
        expect(seen.slice(0, links + 1).at(-1)).toMatch(/project-modal-close/);
    });

    test('Shift+Tab from the close button wraps to the last link', async ({ page }) => {
        await page.keyboard.press('Shift+Tab');
        const lastLink = page.locator('.project-modal-links a').last();
        await expect(lastLink).toBeFocused();
    });
});
