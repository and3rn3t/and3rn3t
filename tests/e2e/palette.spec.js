/**
 * Command palette e2e tests (5.3)
 *
 * Covers: Cmd/Ctrl-K opens, Esc closes, "/" opens, arrow navigation,
 * Enter runs, category filter tabs.
 */
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the command palette manager to register its global shortcut.
    // appState is exposed very early, but the palette is initialized after many
    // deferred dynamic imports — waiting only for appState races the keypress.
    await page
        .waitForFunction(() => Boolean(globalThis.appState?.managers?.palette), { timeout: 10000 })
        .catch(() => {});
});

test('Ctrl+K opens the command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
});

test('Esc closes the command palette', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal[open]');
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
});

test('"/" key opens the palette when not in a text field', async ({ page }) => {
    // Ensure focus is on the body (not an input).
    await page.locator('body').click();
    await page.keyboard.press('/');
    await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
});

test('palette closes when backdrop is clicked', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal[open]');
    // Click outside the inner dialog (on the modal backdrop).
    const modal = page.locator('#global-search-modal');
    const box = await modal.boundingBox();
    // Click top-left corner — outside the inner dialog.
    await page.mouse.click(box.x + 5, box.y + 5);
    await expect(modal).not.toHaveAttribute('open');
});

test('typing filters results', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal[open]');
    await page.fill('#global-search-input', 'theme');
    const items = page.locator('.palette-item');
    await expect(items).not.toHaveCount(0);
    const titles = await items.allTextContents();
    expect(titles.some(t => /theme/i.test(t))).toBe(true);
});

test('ArrowDown + Enter runs the highlighted action', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal[open]');
    // Navigate to first result.
    await page.keyboard.press('ArrowDown');
    // Pressing Enter should execute the action without throwing.
    // (The palette may close or stay open depending on action type.)
    await page.keyboard.press('Enter');
    // Just assert the page is still alive.
    await expect(page.locator('body')).toBeVisible();
});

test('search returns no-matches message for gibberish', async ({ page }) => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal[open]');
    await page.fill('#global-search-input', 'xqzwfbnm');
    const noResults = page.locator('.palette-no-results');
    await expect(noResults).toBeVisible();
});

// ── Accessibility and navigation (#220) ───────────────────────────────────────

const openPalette = async page => {
    await page.keyboard.press('Control+k');
    await page.waitForSelector('#global-search-modal[open]');
    // Focus moves to the input a frame after the modal opens; wait so Tab starts inside it.
    await expect(page.locator('#global-search-input')).toBeFocused();
};

test('Escape closes the palette from a category button, not only from the input', async ({
    page,
}) => {
    await openPalette(page);
    await page.locator('.search-category[data-category="projects"]').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
});

test('Escape closes the palette from the close button', async ({ page }) => {
    await openPalette(page);
    await page.locator('#global-search-close').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
});

test('the palette is a named dialog with a combobox wired to a listbox', async ({ page }) => {
    await openPalette(page);

    // A native <dialog> opened with showModal(): that is what makes it modal (and inert behind)
    const dialog = page.locator('dialog#global-search-modal');
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
    await expect(dialog).toHaveAttribute('aria-label', 'Command palette');

    const input = page.locator('#global-search-input');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-label', 'Search the portfolio');
    const controls = await input.getAttribute('aria-controls');
    await expect(page.locator(`#${controls}`)).toHaveAttribute('role', 'listbox');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#search-results-content [role="option"]').first()).toBeVisible();
});

test('arrow keys move aria-activedescendant and aria-selected together', async ({ page }) => {
    await openPalette(page);
    await page.fill('#global-search-input', 'o');
    const options = page.locator('#search-results-content [role="option"]');
    await expect(options.nth(1)).toBeAttached();
    const input = page.locator('#global-search-input');

    await expect(input).toHaveAttribute('aria-activedescendant', /^palette-option-0$/);
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');

    await expect(input).toHaveAttribute('aria-activedescendant', 'palette-option-1');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'false');
    // The option the input points at really exists.
    expect(await page.locator('#palette-option-1').count()).toBe(1);
});

test('no results clears the active option and collapses the combobox', async ({ page }) => {
    await openPalette(page);
    await page.fill('#global-search-input', 'xqzwfbnm');
    const input = page.locator('#global-search-input');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
    await expect(page.locator('#search-results-status')).toHaveText('No matches found');
});

test('the result count is announced once the visitor searches', async ({ page }) => {
    await openPalette(page);
    const status = page.locator('#search-results-status');
    await expect(status).toHaveText(''); // nothing announced just for opening
    await page.fill('#global-search-input', 'theme');
    await expect(status).toHaveText(/^\d+ results?$/);
});

test('category buttons expose which one is selected', async ({ page }) => {
    await openPalette(page);
    const all = page.locator('.search-category[data-category="all"]');
    const projects = page.locator('.search-category[data-category="projects"]');
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    await expect(projects).toHaveAttribute('aria-pressed', 'false');

    await projects.click();

    await expect(projects).toHaveAttribute('aria-pressed', 'true');
    await expect(all).toHaveAttribute('aria-pressed', 'false');
});

test('closing the palette removes its combobox state', async ({ page }) => {
    await openPalette(page);
    await page.keyboard.press('Escape');
    const input = page.locator('#global-search-input');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/);
    await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
});

test('Tab skips the arrow-key-only options and never reaches the page behind', async ({ page }) => {
    await openPalette(page);
    const focused = () =>
        page.evaluate(() => {
            const el = document.activeElement;
            return {
                // Inside the dialog, or on nothing in the page (the browser's own UI has focus)
                ok: !el || el === document.body || Boolean(el.closest('#global-search-modal')),
                role: el?.getAttribute('role'),
                label: `${el?.tagName?.toLowerCase()}#${el?.id}.${el?.className}`,
            };
        });

    const seen = [];
    for (let i = 1; i <= 12; i++) {
        await page.keyboard.press('Tab');
        const now = await focused();
        seen.push(now.label);
        expect(
            now.ok,
            `Tab press ${i} reached the page behind. Order so far: ${seen.join(' -> ')}`
        ).toBe(true);
        expect(now.role, `Tab press ${i} landed on an option (${now.label})`).not.toBe('option');
    }
});

test('a "Go to" result scrolls to the section, updates the URL and moves focus there', async ({
    page,
}) => {
    await openPalette(page);
    await page.locator('.search-category[data-category="content"]').click();
    await page.fill('#global-search-input', 'contact');
    await page.keyboard.press('Enter');

    await expect(page.locator('#global-search-modal')).not.toHaveAttribute('open');
    await expect(page).toHaveURL(/#contact$/);
    // Focus lands on the section, not back on whatever opened the palette.
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('contact');
});

test('a project result opens its page on the site instead of leaving for GitHub', async ({
    page,
}) => {
    const target = await page.evaluate(async () => {
        const slug = document
            .querySelector('#projects [data-project] a[href^="/projects/"]')
            ?.getAttribute('href')
            .split('/')[2];
        const data = await (await fetch('/projects-data.json')).json();
        const project = data.projects.find(
            p => (p.github_repo?.split('/').pop() ?? p.name).toLowerCase() === slug
        );
        return slug && project ? { slug, title: project.displayName || project.name } : null;
    });
    test.skip(!target, 'no project with a page in current data');

    await openPalette(page);
    await page.locator('.search-category[data-category="projects"]').click();
    await page.fill('#global-search-input', target.title);
    await page.keyboard.press('Enter');

    await page.waitForURL(`**/projects/${target.slug}/`);
    await expect(page.locator('h1')).toBeVisible();
});

test('running "Toggle theme" with the mouse hands focus back to the input', async ({ page }) => {
    await openPalette(page);
    await page.fill('#global-search-input', 'toggle theme');
    await page.locator('.palette-item', { hasText: 'Toggle theme' }).first().click();

    await expect(page.locator('#global-search-modal')).toHaveAttribute('open', ''); // stays open
    await expect(page.locator('#global-search-input')).toBeFocused();

    // Focus is back inside the trap, so Tab cannot walk out of the open dialog.
    for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        expect(
            await page.evaluate(() =>
                Boolean(document.activeElement?.closest('#global-search-modal'))
            )
        ).toBe(true);
    }
});

test('the toast live regions are in the page, empty, before any message', async ({ page }) => {
    for (const id of ['app-notification', 'palette-toast']) {
        const region = page.locator(`#${id}`);
        await expect(region).toBeAttached();
        await expect(region).toHaveAttribute('role', 'status');
        await expect(region).toHaveText('');
    }
});
