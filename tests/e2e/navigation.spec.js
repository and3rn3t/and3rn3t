/**
 * In-page navigation e2e tests
 *
 * Section links must land the section just below the fixed navbar (CSS
 * scroll-margin-top), and the skip link must target a <main> landmark.
 */
import { test, expect } from '@playwright/test';

// Instant scrolling keeps the assertion deterministic
test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });

// Async sections (projects, stats, writing) change page height as they render; wait for them
// so the scroll target doesn't move after the click.
test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#projects-grid .project-card').first()).toBeVisible();
    await expect(page.locator('#blog-posts .blog-card').first()).toBeVisible();
});

test('nav link scrolls the section just below the navbar', async ({ page }) => {
    await page.locator('.nav-links a[href="#projects"]').click();

    const { navBottom, sectionTop } = await page.evaluate(() => ({
        navBottom: document.getElementById('navbar').getBoundingClientRect().bottom,
        sectionTop: document.getElementById('projects').getBoundingClientRect().top,
    }));
    expect(sectionTop).toBeGreaterThanOrEqual(navBottom);
    expect(sectionTop - navBottom).toBeLessThan(24);
    expect(new URL(page.url()).hash).toBe('#projects');
});

test('skip link targets the main landmark', async ({ page }) => {
    await expect(page.locator('main#main')).toHaveCount(1);
    await expect(page.locator('.skip-link')).toHaveAttribute('href', '#main');
});

for (const id of ['about', 'projects', 'experience', 'writing', 'contact']) {
    test(`scroll-spy marks #${id} with aria-current="location"`, async ({ page }) => {
        await page.locator(`.nav-links a[href="#${id}"]`).click();
        await expect(page.locator(`.nav-links a[href="#${id}"]`)).toHaveAttribute(
            'aria-current',
            'location'
        );
    });
}

test.describe('mobile navbar', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('theme toggle sits in the navbar without overlapping the menu button', async ({
        page,
    }) => {
        const toggle = page.locator('#navbar #theme-toggle');
        await expect(toggle).toBeVisible();

        const [t, h, nav] = await Promise.all([
            toggle.boundingBox(),
            page.locator('.nav-toggle').boundingBox(),
            page.locator('#navbar').boundingBox(),
        ]);
        expect(t.x + t.width).toBeLessThanOrEqual(h.x);
        // Both buttons fit inside the bar
        for (const box of [t, h]) {
            expect(box.y).toBeGreaterThanOrEqual(nav.y);
            expect(box.y + box.height).toBeLessThanOrEqual(nav.y + nav.height);
        }
    });
});
