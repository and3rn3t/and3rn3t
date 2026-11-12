/**
 * The intro (hero): who it is, what to do next, and what is live.
 */
import { test, expect } from './fixtures.js';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('the intro names the person and says what they build', async ({ page }) => {
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Matthew Anderson');
    await expect(h1).toContainText('health tech');
});

test('one primary action leads to the work, and the other ways to reach out are links', async ({
    page,
}) => {
    const intro = page.locator('#home');
    await expect(intro.locator('.button--primary')).toHaveCount(1);
    await expect(intro.locator('.button--primary')).toHaveAttribute('href', '#projects');

    const hrefs = await intro
        .locator('.intro__links a')
        .evaluateAll(links => links.map(link => link.getAttribute('href')));
    expect(hrefs).toEqual([
        '/resume.pdf',
        'https://github.com/and3rn3t',
        'https://linkedin.com/in/and3rn3t',
        'mailto:and3rn3t@icloud.com',
    ]);
});

test('the live "currently" line is part of the intro', async ({ page }) => {
    // The Worker is stubbed (fixtures.js) to report a push to and3rn3t/example
    const status = page.locator('#home .intro__status .currently-widget');
    await expect(status).toBeVisible();
    await expect(status).toContainText('example');
    await expect(status).toContainText('feat: fixture commit');
});

test('there is no typewriter: the headline is plain, stable text', async ({ page }) => {
    await expect(page.locator('.hero-role, .hero-caret')).toHaveCount(0);
    const before = await page.locator('.intro__headline').textContent();
    await page.waitForTimeout(600);
    expect(await page.locator('.intro__headline').textContent()).toBe(before);
});
