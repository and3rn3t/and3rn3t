/**
 * Hero text effects with animation enabled (the rest of the suite runs with reduced motion,
 * where they are static).
 *
 * Runs on a fake clock so a whole typewriter pass takes milliseconds, and pretends to be a
 * low-end device so the hero's canvas animation (which would run thousands of frames on that
 * clock) stays off.
 */
import { test, expect } from './fixtures.js';

test.use({ reducedMotion: 'no-preference' });

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 });
    });
    await page.clock.install();
    await page.goto('/');
    // initHeroText has run once the role is being animated (hidden from assistive tech).
    await page.waitForSelector('.hero-role[aria-hidden="true"]');
});

const roles = page =>
    page.evaluate(() => document.querySelector('.hero-role').dataset.roles.split('|'));

test('while it animates, screen readers get stable text instead of half-typed words', async ({
    page,
}) => {
    const [first] = await roles(page);
    await page.clock.runFor(300); // mid-way: the name scramble lasts about a second

    await expect(page.locator('.hero-role')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.hero-subtitle .sr-only')).toHaveText(first);
    await expect(page.locator('.hero-title .sr-only')).toHaveText('Matthew Anderson');
});

test('the role typewriter makes one pass, then rests on the first role and stops', async ({
    page,
}) => {
    const [first, second] = await roles(page);
    const role = page.locator('.hero-role');

    // Partway through it is showing other roles.
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
        await page.clock.runFor(100);
        seen.add((await role.textContent()).trim());
    }
    expect(seen.has(second)).toBe(true);

    await page.clock.runFor(120_000);
    await expect(role).toHaveText(first);
    await expect(role).not.toHaveAttribute('aria-hidden', /.*/);
    await expect(page.locator('.hero-subtitle .sr-only')).toHaveCount(0);
    await expect(page.locator('.hero-caret')).toBeHidden(); // the caret stopped blinking too

    // And it stays put.
    await page.clock.runFor(60_000);
    await expect(role).toHaveText(first);
});

test('the name settles back to plain text', async ({ page }) => {
    await page.clock.runFor(3000);
    const name = page.locator('.hero-title .highlight');
    await expect(name).toHaveText('Matthew Anderson');
    await expect(name).not.toHaveAttribute('aria-hidden', /.*/);
    await expect(page.locator('.hero-title .sr-only')).toHaveCount(0);
});
