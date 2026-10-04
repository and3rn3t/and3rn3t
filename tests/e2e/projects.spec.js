/**
 * Featured projects + "Show more" expander e2e tests
 *
 * Covers: featured cards render first, the expander reveals/hides the rest,
 * and a deep link to a hidden project's case study expands the grid.
 */
import { test, expect } from '@playwright/test';

const visibleCards = '#projects-grid .project-card:not([hidden])';
const hiddenCards = '#projects-grid .project-card[hidden]';

test('shows only featured projects until expanded', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#projects-more-btn');
    await expect(page.locator(visibleCards).first()).toBeVisible();

    const featured = await page.locator(visibleCards).count();
    const extras = await page.locator(hiddenCards).count();
    expect(featured).toBeGreaterThan(0);
    test.skip(extras === 0, 'no non-featured projects in current data');

    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveText(new RegExp(`Show ${extras} more project`));

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(visibleCards)).toHaveCount(featured + extras);
    // Focus moves to the first newly revealed card.
    await expect(page.locator('[data-extra] .project-title a').first()).toBeFocused();

    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(visibleCards)).toHaveCount(featured);
});

test('deep link to a hidden case study expands the grid', async ({ page }) => {
    await page.goto('/');
    const slug = await page
        .locator('[data-extra] [data-case-study]')
        .first()
        .getAttribute('data-case-study', { timeout: 5000 })
        .catch(() => null);
    test.skip(!slug, 'no hidden project with a case study in current data');

    // Leave the page first so this is a fresh load, not a same-document hash change.
    await page.goto('about:blank');
    await page.goto(`/#project/${slug}`);
    await expect(page.locator('#projects-more-btn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('body')).toHaveClass(/modal-open/);
});
