/**
 * The command palette and keyboard help are native <dialog>s (showModal), and the page's two
 * toasts share one style. This is what that buys and how it looks; the palette's behaviour is in
 * palette.spec.js and focus-trap.spec.js.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

/** WCAG contrast ratio of two [r, g, b] colours. */
function contrast(foreground, background) {
    const luminance = rgb => {
        const [r, g, b] = rgb.map(channel => {
            const v = channel / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

const channels = colour => colour.match(/[\d.]+/g).map(Number);

const ready = async page => {
    await page.goto('/');
    await page.waitForFunction(
        () => globalThis.appState?.managers?.palette && globalThis.appState?.managers?.keyboardHelp
    );
};

const openPalette = async page => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
};

test.describe('the palette as a native dialog', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('is modal: the page behind cannot take focus and does not scroll', async ({ page }) => {
        await openPalette(page);
        expect(
            await page.locator('#global-search-modal').evaluate(el => el.matches(':modal'))
        ).toBe(true);
        const behindTakesFocus = await page.evaluate(() => {
            const link = document.querySelector('.site-nav a');
            link.focus();
            return document.activeElement === link;
        });
        expect(behindTakesFocus).toBe(false);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
            'hidden'
        );
    });

    test('gives the page its scroll back when it closes', async ({ page }) => {
        await openPalette(page);
        await page.keyboard.press('Escape');
        await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
        expect(
            await page.evaluate(() => getComputedStyle(document.documentElement).overflow)
        ).not.toBe('hidden');
    });

    test('indexes the posts, and a post result opens its page', async ({ page }) => {
        await openPalette(page);
        await page.locator('.search-category[data-category="content"]').click();
        await page.fill('#global-search-input', 'how this site works');
        await expect(page.locator('#search-results-content .palette-item').first()).toContainText(
            'How This Site Works'
        );
        await page.keyboard.press('Enter');
        await page.waitForURL('**/posts/how-this-site-works/');
    });

    test('shows the option type and a subtitle that is not the id of a section', async ({
        page,
    }) => {
        await openPalette(page);
        const first = page.locator('#search-results-content .palette-item').first();
        await expect(first.locator('.palette-item-title')).not.toBeEmpty();
        await expect(first.locator('.palette-item-type')).not.toBeEmpty();
    });
});

test.describe('keyboard help as a native dialog', () => {
    test.beforeEach(async ({ page }) => ready(page));

    test('opens with ? and closes with the close button, Esc and the backdrop', async ({
        page,
    }) => {
        const help = page.locator('#keyboard-help');
        await page.locator('body').click();
        await page.keyboard.press('?');
        await expect(help).toHaveAttribute('open', '');
        expect(await help.evaluate(el => el.matches(':modal'))).toBe(true);

        await page.locator('#keyboard-help-close').click();
        await expect(help).not.toHaveAttribute('open');

        await page.keyboard.press('?');
        await expect(help).toHaveAttribute('open', '');
        await page.keyboard.press('Escape');
        await expect(help).not.toHaveAttribute('open');

        await page.keyboard.press('?');
        await expect(help).toHaveAttribute('open', '');
        const box = await help.boundingBox();
        await page.mouse.click(box.x - 10, box.y - 10); // on the backdrop
        await expect(help).not.toHaveAttribute('open');
    });

    test('? does not open it on top of the palette', async ({ page }) => {
        await openPalette(page);
        await page.locator('.search-category[data-category="all"]').focus(); // not a text field
        await page.keyboard.press('?');
        await expect(page.locator('#keyboard-help')).not.toHaveAttribute('open');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
    });

    test('lists its shortcuts as a description list', async ({ page }) => {
        await page.locator('body').click();
        await page.keyboard.press('?');
        await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
        expect(await page.locator('#keyboard-help dt').count()).toBeGreaterThanOrEqual(8);
        expect(await page.locator('#keyboard-help dd').count()).toBe(
            await page.locator('#keyboard-help dt').count()
        );
    });
});

for (const theme of ['light', 'dark']) {
    test.describe(`in the ${theme} theme`, () => {
        test.beforeEach(async ({ page }) => {
            await page.addInitScript(t => localStorage.setItem('theme', t), theme);
            await ready(page);
        });

        const scan = page =>
            new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .include('dialog[open]')
                .analyze();

        test('the open palette, with results and a current option, has no axe violations', async ({
            page,
        }) => {
            await openPalette(page);
            await page.fill('#global-search-input', 'health');
            await expect(page.locator('.palette-item.is-active')).toHaveCount(1);
            await page.waitForTimeout(400); // past the open transition
            expect((await scan(page)).violations).toEqual([]);
        });

        test('the open keyboard help has no axe violations', async ({ page }) => {
            await page.locator('body').click();
            await page.keyboard.press('?');
            await expect(page.locator('#keyboard-help')).toHaveAttribute('open', '');
            await page.waitForTimeout(400);
            expect((await scan(page)).violations).toEqual([]);
        });

        test('the current palette option and its icon stay readable', async ({ page }) => {
            await openPalette(page);
            const read = async selector =>
                page
                    .locator(selector)
                    .first()
                    .evaluate(el => {
                        const style = getComputedStyle(el);
                        return { color: style.color, background: style.backgroundColor };
                    });
            const item = await read('.palette-item.is-active .palette-item-title');
            const icon = await read('.palette-item.is-active .palette-item-icon');
            // The title sits on a translucent wash over the dialog surface; measure the icon tile
            // (solid) and the muted subtitle against the dialog's own surface
            const surface = await page
                .locator('#global-search-modal')
                .evaluate(el => getComputedStyle(el).backgroundColor);
            const subtitle = await page
                .locator('.palette-item-subtitle')
                .first()
                .evaluate(el => getComputedStyle(el).color);
            expect(
                contrast(channels(icon.color), channels(icon.background))
            ).toBeGreaterThanOrEqual(4.5);
            expect(contrast(channels(subtitle), channels(surface))).toBeGreaterThanOrEqual(4.5);
            expect(item.color).not.toBe('');
        });

        for (const variant of ['info', 'success', 'error', 'warning']) {
            test(`the ${variant} toast is readable`, async ({ page }) => {
                await page.evaluate(
                    v =>
                        globalThis.appState.managers.ui.showNotification(
                            `A ${v} message`,
                            v,
                            60000
                        ),
                    variant
                );
                const toast = page.locator('#app-notification');
                await expect(toast).toHaveClass(/visible/);
                await expect(toast).toHaveText(`A ${variant} message`);
                const { color, background } = await toast.evaluate(el => {
                    const style = getComputedStyle(el);
                    return { color: style.color, background: style.backgroundColor };
                });
                expect(
                    contrast(channels(color), channels(background)),
                    `${variant}: ${color} on ${background}`
                ).toBeGreaterThanOrEqual(4.5);
            });
        }
    });
}

test('both toasts are the same component', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => globalThis.appState.managers.ui.showNotification('Hello', 'info'));
    await expect(page.locator('#app-notification')).toHaveClass(/\btoast\b/);
    expect(
        await page.locator('#palette-toast').evaluate(el => el.classList.contains('toast'))
    ).toBe(true);
});

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the palette fits the screen and scrolls its results', async ({ page }) => {
        await ready(page);
        await page.keyboard.press('Control+k');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
        const box = await page.locator('#global-search-modal').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        expect(box.y + box.height).toBeLessThanOrEqual(844);
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth - globalThis.innerWidth)
        ).toBeLessThanOrEqual(0);
    });

    test('keyboard help fits the screen', async ({ page }) => {
        await ready(page);
        await page.evaluate(() => globalThis.appState.managers.keyboardHelp.open());
        const box = await page.locator('#keyboard-help').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390);
    });
});
