/**
 * Selected work: a lead card, a grid of cards, and a compact list, all pre-rendered; the browser
 * only makes their case studies work.
 */
import { test, expect } from './fixtures.js';

test('shows the lead card, the grid and the compact list, with nothing hidden', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.locator('#projects .lead-card')).toBeVisible();

    const cards = page.locator('#projects-grid .work-card');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const card of await cards.all()) await expect(card).toBeVisible();

    const rows = page.locator('#projects-more .project-list__row');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) await expect(row).toBeVisible();

    // The old "Show more" expander is gone: everything starred is on the page
    await expect(page.locator('#projects-more-btn, [data-extra]')).toHaveCount(0);
});

test('every project with a write-up gets a working case-study button', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#projects [data-case-study]:not([data-pending])');
    await expect(page.locator('#projects [data-case-study][data-pending]')).toHaveCount(0);

    const slugs = await page
        .locator('#projects [data-case-study]')
        .evaluateAll(buttons => buttons.map(button => button.dataset.caseStudy));
    expect(slugs.length).toBeGreaterThan(3);

    // One from each shape opens its study
    for (const selector of [
        '.lead-card [data-case-study]',
        '.work-card [data-case-study]',
        '.project-list__row [data-case-study]',
    ]) {
        const button = page.locator(`#projects ${selector}`).first();
        await button.scrollIntoViewIfNeeded();
        await button.click();
        await expect(page.locator('#project-modal')).toHaveClass(/visible/);
        await page.keyboard.press('Escape');
        await expect(page.locator('#project-modal')).not.toHaveClass(/visible/);
    }
});

test('a deep link to a project in the compact list opens its case study', async ({ page }) => {
    await page.goto('/');
    const slug = await page
        .locator('#projects-more [data-case-study]')
        .first()
        .getAttribute('data-case-study');

    // Leave the page first so this is a fresh load, not a same-document hash change.
    await page.goto('about:blank');
    await page.goto(`/#project/${slug}`);
    await expect(page.locator('body')).toHaveClass(/modal-open/);
});

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('cards stack in one column; there is no sideways carousel', async ({ page }) => {
        await page.goto('/');
        const cards = await page.locator('#projects-grid .work-card').evaluateAll(els =>
            els.map(el => {
                const { left, width, top } = el.getBoundingClientRect();
                return { left: Math.round(left), width: Math.round(width), top: Math.round(top) };
            })
        );
        expect(cards.length).toBeGreaterThan(1);
        // Same left edge and width, and each below the one before
        expect(new Set(cards.map(card => card.left)).size).toBe(1);
        expect(new Set(cards.map(card => card.width)).size).toBe(1);
        expect(cards.map(card => card.top)).toEqual(
            [...cards.map(card => card.top)].sort((a, b) => a - b)
        );

        const overflows = await page.evaluate(() => {
            const grid = document.getElementById('projects-grid');
            return (
                grid.scrollWidth > grid.clientWidth ||
                document.documentElement.scrollWidth > globalThis.innerWidth
            );
        });
        expect(overflows).toBe(false);
    });
});
