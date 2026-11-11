/**
 * The home page's curated content is pre-rendered (scripts/generate-site.mjs), so it must be
 * readable before, or without, JavaScript: no spinners, no hidden sections.
 */
import { test, expect } from './fixtures.js';

test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('every project is visible, in all three shapes', async ({ page }) => {
        for (const selector of [
            '#projects .lead-card',
            '#projects-grid .work-card',
            '#projects-more .project-list__row',
        ]) {
            const items = page.locator(selector);
            expect(await items.count(), selector).toBeGreaterThan(0);
            for (const item of await items.all()) await expect(item).toBeVisible();
        }
    });

    test('experience and education are visible', async ({ page }) => {
        await expect(page.locator('#experience-timeline .timeline-item').first()).toBeVisible();
        await expect(page.locator('#education-timeline .timeline-item').first()).toBeVisible();
    });

    test('case-study buttons are not offered, since they need JS to open', async ({ page }) => {
        const buttons = page.locator('#projects-grid [data-case-study]');
        expect(await buttons.count()).toBeGreaterThan(0);
        for (const button of await buttons.all()) await expect(button).toBeHidden();
    });

    test('writing links to the post pages', async ({ page }) => {
        const link = page.locator('#blog-posts a[href^="/posts/"]').first();
        await expect(link).toBeVisible();
    });

    test('sections are not hidden waiting for a script', async ({ page }) => {
        for (const id of ['about', 'projects', 'experience', 'writing', 'contact']) {
            const opacity = await page
                .locator(`#${id}`)
                .evaluate(el => getComputedStyle(el).opacity);
            expect(opacity, `#${id}`).toBe('1');
        }
    });

    test('no loading spinner stands in for curated content', async ({ page }) => {
        for (const id of [
            'projects-grid',
            'experience-timeline',
            'education-timeline',
            'blog-posts',
        ]) {
            await expect(page.locator(`#${id} .loading`)).toHaveCount(0);
        }
    });
});

test('a case-study button is enabled only once its study is registered', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('#projects [data-project="health"] [data-case-study]');
    await expect(button).toBeVisible();
    await expect(button).not.toHaveAttribute('data-pending');
    await button.click();
    await expect(page.locator('#project-modal')).toHaveClass(/visible/);
});

test('a project stays live when newer data no longer stars its repo', async ({ page }) => {
    // The HTML and the JSON are cached separately, so an older page can meet newer data.
    await page.route('**/github-data.json', async route => {
        const response = await route.fetch();
        const data = await response.json();
        data.selfStarredRepoNames = data.selfStarredRepoNames.filter(
            name => name !== 'apple-music-dj'
        );
        await route.fulfill({ response, json: data });
    });
    await page.goto('/');

    const button = page.locator('#projects [data-project="apple-music-dj"] [data-case-study]');
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('#project-modal')).toHaveClass(/visible/);
});
