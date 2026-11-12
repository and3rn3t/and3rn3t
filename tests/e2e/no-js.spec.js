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
        await expect(page.locator('#experience-timeline .job').first()).toBeVisible();
        await expect(page.locator('#education-timeline .edu-row').first()).toBeVisible();
    });

    test('a job folds open and shut without any script (it is a native <details>)', async ({
        page,
    }) => {
        const past = page
            .locator('#experience-timeline .job:not(.job--current) .job__more')
            .first();
        await expect(past).not.toHaveAttribute('open');
        await past.locator('summary').click();
        await expect(past).toHaveAttribute('open');
        await expect(past.locator('.job__highlights')).toBeVisible();
    });

    test('the live GitHub band is hidden, since it has nothing to show', async ({ page }) => {
        await expect(page.locator('#github-band')).toBeHidden();
    });

    test('every project with a write-up links to its page, which needs no script', async ({
        page,
    }) => {
        const links = page.locator('#projects [data-project] a[href^="/projects/"]');
        expect(await links.count()).toBeGreaterThan(3);
        await expect(links.first()).toBeVisible();
        await expect(page.locator('#projects button')).toHaveCount(0);
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

test('a project card reaches its page with a click', async ({ page }) => {
    await page.goto('/');
    const link = page
        .locator('#projects [data-project="health"] a[href="/projects/health/"]')
        .first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL('**/projects/health/');
    await expect(page.locator('h1')).toContainText('Health');
});

test('a project stays linked when newer data no longer stars its repo', async ({ page }) => {
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

    const link = page
        .locator('#projects [data-project="apple-music-dj"] a[href^="/projects/"]')
        .first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL('**/projects/apple-music-dj/');
});
