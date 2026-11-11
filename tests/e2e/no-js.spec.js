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

    test('projects, including those behind "Show more", are visible', async ({ page }) => {
        const cards = page.locator('#projects-grid .project-card');
        expect(await cards.count()).toBeGreaterThan(0);
        for (const card of await cards.all()) await expect(card).toBeVisible();

        // The button can't do anything without JS, so it is not offered
        await expect(page.locator('#projects-more-btn')).toBeHidden();
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

test('the pre-rendered cards come alive once JavaScript runs', async ({ page }) => {
    await page.goto('/');
    const health = page.locator('#projects-grid [data-project="health"]');
    await expect(health).toBeVisible();

    // Stars start as a placeholder and are filled in from the cached GitHub data
    await expect(health.locator('[data-live="stars"]')).toHaveText(/^\d+$/);
    await expect(health.locator('[data-live-stat="pushed"]')).toBeVisible();
    await expect(health.locator('[data-live="pushed"]')).toHaveText(/ago$/);
});

test('a case-study button is enabled only once its study is registered', async ({ page }) => {
    await page.goto('/');
    const button = page.locator('#projects-grid [data-project="health"] [data-case-study]');
    await expect(button).toBeVisible();
    await expect(button).not.toHaveAttribute('data-pending');
    await button.click();
    await expect(page.locator('#project-modal')).toHaveClass(/visible/);
});

test('cards stay live when newer data no longer stars their repo', async ({ page }) => {
    // The HTML and the JSON are cached separately, so an older page can meet newer data.
    await page.route('**/github-data.json', async route => {
        const response = await route.fetch();
        const data = await response.json();
        data.selfStarredRepoNames = data.selfStarredRepoNames.filter(name => name !== 'fastlane');
        await route.fulfill({ response, json: data });
    });
    await page.goto('/');

    const card = page.locator('#projects-grid [data-project="fastlane"]');
    await expect(card.locator('[data-live="stars"]')).toHaveText(/^\d+$/);
    await expect(card.locator('[data-live="pushed"]')).toHaveText(/ago$/);
});
