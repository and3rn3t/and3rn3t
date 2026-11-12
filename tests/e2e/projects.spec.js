/**
 * Selected work: a lead card, a grid of cards, and a compact list, all pre-rendered, each linking
 * to the project's own page (see project-pages.spec.js).
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

test('every project with a write-up links to its own page', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page
        .locator('#projects [data-project] a[href^="/projects/"]')
        .evaluateAll(links => [...new Set(links.map(link => link.getAttribute('href')))]);
    expect(hrefs.length).toBeGreaterThan(3);

    // One from each shape leads to a page that exists, in this tab: a plain link, no script
    for (const selector of ['.lead-card', '.work-card', '.project-list__row']) {
        const link = page.locator(`#projects ${selector} a[href^="/projects/"]`).first();
        const href = await link.getAttribute('href');
        const response = await page.request.get(href);
        expect(response.status(), href).toBe(200);
        expect(await link.getAttribute('target'), href).toBeNull();
    }
});

test('a project card opens its page and the pager brings you back', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('#projects .lead-card');
    const title = card.locator('a[href^="/projects/"]').first();
    const href = await title.getAttribute('href');
    await title.click();
    await page.waitForURL(`**${href}`);
    await expect(page.locator('h1')).toBeVisible();

    await page.getByRole('link', { name: 'All projects' }).first().click();
    await page.waitForURL('**/#projects');
    await expect(page.locator('#projects')).toBeVisible();
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
