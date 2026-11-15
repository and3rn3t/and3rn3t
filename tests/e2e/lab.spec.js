/**
 * The lab (/lab/, modules/capabilities.js `lab()`): experiments are off unless asked for.
 * The ordinary page must never fetch an experiment's module, and the lab page must list the
 * experiments and keep a switch in this browser only.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

test('the default page does not load the GPU hero', async ({ page }) => {
    const requested = [];
    page.on('request', request => requested.push(new URL(request.url()).pathname));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(requested).not.toContain('/modules/hero-gpu.js');
});

test('/lab/ lists the experiments and a switch is remembered', async ({ page }) => {
    await page.goto('/lab/');
    await expect(page.getByRole('heading', { level: 1, name: 'Things to try' })).toBeVisible();
    const toggle = page.locator('[data-lab-toggle="hero-gpu"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.reload();
    await expect(page.locator('[data-lab-toggle="hero-gpu"]')).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('lab'))).toBe('hero-gpu');
});

for (const theme of ['light', 'dark']) {
    test(`/lab/ has no axe violations in the ${theme} theme`, async ({ page }) => {
        await page.addInitScript(value => localStorage.setItem('theme', value), theme);
        await page.goto('/lab/');
        await expect(page.locator('[data-lab-toggle="hero-gpu"]')).toBeVisible();
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .exclude('iframe[src*="cloudflare"]')
            .analyze();
        expect(results.violations).toEqual([]);
    });
}
