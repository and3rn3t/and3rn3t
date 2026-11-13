/**
 * Generated project pages (/projects/<slug>/): pre-rendered by scripts/generate-site.mjs, so they
 * are readable without JavaScript, shareable, and carry their own metadata.
 */
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, mockWorker } from './fixtures.js';

const { projects } = JSON.parse(readFileSync('projects-data.json', 'utf8'));
const SLUGS = projects
    .filter(project => project.longDescription || (project.highlights ?? []).length > 1)
    .map(project => (project.github_repo?.split('/').pop() ?? project.name).toLowerCase());

/** WCAG contrast ratio of two [r, g, b] colours. */
function contrast(foreground, background) {
    const luminance = rgb => {
        const [r, g, b] = rgb.map(channel => {
            const v = channel / 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
}

test('there is a page for every project with a write-up', () => {
    expect(SLUGS.length).toBeGreaterThan(3);
    expect(new Set(SLUGS).size).toBe(SLUGS.length);
});

test('every project page loads cleanly, with its own title, canonical URL and no broken files', async ({
    page,
}) => {
    const errors = [];
    const failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
        if (response.status() >= 400 && response.url().startsWith('http://localhost'))
            failed.push(`${response.status()} ${response.url()}`);
    });

    for (const slug of SLUGS) {
        await page.goto(`/projects/${slug}/`);
        await expect(page.locator('h1'), slug).toBeVisible();
        await expect(page.locator('link[rel="canonical"]'), slug).toHaveAttribute(
            'href',
            `https://andernet.dev/projects/${slug}/`
        );
        expect(await page.title(), slug).toContain('| Matthew Anderson');
    }
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
});

test.describe('JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false });

    test('the whole page is there: header, hero, overview, highlights, facts, pager', async ({
        page,
    }) => {
        await page.goto('/projects/health/');
        await expect(page.locator('h1')).toContainText('VitalSense');
        await expect(page.locator('.project-hero img').first()).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Highlights' })).toBeVisible();
        await expect(page.locator('.facts')).toBeVisible();
        await expect(page.locator('.pager a').first()).toBeVisible();
        await expect(page.getByRole('link', { name: /Source on GitHub/ })).toBeVisible();
    });
});

test('the share card, description and structured data are in the raw HTML', async ({ request }) => {
    const html = await (await request.get('/projects/health/')).text();
    expect(html).toMatch(/property="og:image" content="https:\/\/andernet\.dev\/[^"]+\.(jpg|png)"/);
    expect(html).toMatch(/property="og:type" content="article"/);
    expect(html).toMatch(/name="description" content="[^"]{20,}"/);

    const blocks = [
        ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ].map(match => JSON.parse(match[1]));
    expect(blocks.map(block => block['@type'])).toEqual(['SoftwareSourceCode', 'BreadcrumbList']);
});

test('the share image of every page exists', async ({ request }) => {
    for (const slug of SLUGS) {
        const html = await (await request.get(`/projects/${slug}/`)).text();
        const image = html.match(
            /property="og:image" content="https:\/\/andernet\.dev(\/[^"]+)"/
        )[1];
        expect((await request.get(image)).status(), `${slug}: ${image}`).toBe(200);
    }
});

test('the sitemap lists every project page', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const slug of SLUGS) {
        expect(sitemap, slug).toContain(`<loc>https://andernet.dev/projects/${slug}/</loc>`);
    }
});

test('the pager chains every project page once, from the first to the last', async ({ page }) => {
    const hrefOf = async selector => {
        const link = page.locator(selector);
        return (await link.count()) ? link.getAttribute('href') : null;
    };

    // Walk back to the first page...
    await page.goto('/projects/health/');
    for (let step = 0; step <= SLUGS.length; step++) {
        const prev = await hrefOf('.pager__link--prev');
        if (!prev) break;
        await page.goto(prev);
    }
    await expect(page.locator('.pager__link--prev')).toHaveCount(0);

    // ...then forward to the last, collecting each page on the way
    const seen = [new URL(page.url()).pathname];
    for (let step = 0; step <= SLUGS.length; step++) {
        const next = await hrefOf('.pager__link--next');
        if (!next) break;
        await page.goto(next);
        seen.push(new URL(page.url()).pathname);
    }
    expect([...seen].sort()).toEqual(SLUGS.map(slug => `/projects/${slug}/`).sort());
});

test('names the image and title for the card-to-page transition, and does not ship a modal', async ({
    page,
}) => {
    await page.goto('/projects/health/');
    await expect(page.locator('.project-head__title')).toHaveAttribute('data-vt', 'title');
    await expect(page.locator('.project-hero')).toHaveAttribute('data-vt', 'media');
    await expect(page.locator('#project-modal')).toHaveCount(0);

    await page.goto('/');
    const card = page.locator('.lead-card[data-project="health"]');
    await expect(card).toHaveAttribute('data-page', 'health');
    await expect(card.locator('[data-vt="media"]')).toHaveCount(1);
    await expect(page.locator('#project-modal')).toHaveCount(0);
});

test('opts in to cross-document view transitions', async ({ page }) => {
    await page.goto('/projects/health/');
    const optedIn = await page.evaluate(() =>
        [...document.styleSheets].some(sheet =>
            [...sheet.cssRules].some(rule => rule.cssText.startsWith('@view-transition'))
        )
    );
    expect(optedIn).toBe(true);
});

test('theme toggle works on a project page and is remembered', async ({ page }) => {
    await page.goto('/projects/health/');
    const toggle = page.locator('#theme-toggle');
    const before = await page.locator('html').getAttribute('data-theme');
    await toggle.click();
    await expect.poll(() => page.locator('html').getAttribute('data-theme')).not.toBe(before);
    const after = await page.locator('html').getAttribute('data-theme');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', after);
});

test('has no horizontal overflow on a phone', async ({ browser }) => {
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    await mockWorker(context);
    const page = await context.newPage();
    for (const slug of SLUGS) {
        await page.goto(`/projects/${slug}/`);
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - globalThis.innerWidth
        );
        expect(overflow, slug).toBeLessThanOrEqual(0);
    }
    await context.close();
});

for (const theme of ['light', 'dark']) {
    test(`has no axe violations in the ${theme} theme`, async ({ page }) => {
        await page.addInitScript(t => localStorage.setItem('theme', t), theme);
        for (const slug of ['health', SLUGS.at(-1)]) {
            await page.goto(`/projects/${slug}/`);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await page.waitForTimeout(400);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .exclude('iframe[src*="cloudflare"]')
                .analyze();
            expect(results.violations, slug).toEqual([]);
        }
    });

    test(`the page's buttons are readable at rest and on hover in the ${theme} theme`, async ({
        page,
    }) => {
        await page.addInitScript(t => localStorage.setItem('theme', t), theme);
        await page.goto('/projects/health/');

        const buttons = page.locator('.project-head__actions .button');
        expect(await buttons.count()).toBeGreaterThan(0);
        for (const button of await buttons.all()) {
            for (const state of ['rest', 'hover']) {
                await page.mouse.move(0, 0);
                if (state === 'hover') await button.hover();
                await page.waitForTimeout(350); // past the colour transition
                const { color, background } = await button.evaluate(el => {
                    const style = getComputedStyle(el);
                    return { color: style.color, background: style.backgroundColor };
                });
                const [fg, bg] = [color, background].map(c => c.match(/[\d.]+/g).map(Number));
                // A transparent button sits on the page, which axe measures; solid ones are here
                if ((bg[3] ?? 1) === 1) {
                    expect(
                        contrast(fg, bg),
                        `${await button.innerText()} ${state}: ${color} on ${background}`
                    ).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
    });
}

test('the project page does not need the legacy stylesheet: icons, skip link and sr-only work', async ({
    page,
}) => {
    await page.goto('/projects/health/');
    const loaded = await page.evaluate(() => [...document.styleSheets].map(sheet => sheet.href));
    expect(loaded.some(href => href?.endsWith('/styles.css'))).toBe(false);

    // The skip link is off screen until focused, then visible
    const skip = page.locator('.skip-link');
    expect((await skip.boundingBox()).y).toBeLessThan(0);
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox()).y).toBeGreaterThanOrEqual(0);

    // Icons are sized by core.css, not left at the SVG default of 100% of the container
    const iconSize = await page
        .locator('.project-head__actions .icon')
        .first()
        .evaluate(el => el.getBoundingClientRect().width);
    expect(iconSize).toBeGreaterThan(0);
    expect(iconSize).toBeLessThan(40);
});

test.describe('card-to-page transition names', () => {
    /** The names `[data-vt]` elements have right now. */
    const currentNames = page =>
        page.evaluate(() =>
            [...document.querySelectorAll('[data-vt]')]
                .map(el => getComputedStyle(el).viewTransitionName)
                .filter(name => name !== 'none')
        );

    // Records, per arriving page, the names it had once its transition was ready to run (or
    // 'skipped'). sessionStorage carries it across the navigations.
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const record = value => {
                const seen = JSON.parse(sessionStorage.getItem('vt') ?? '[]');
                sessionStorage.setItem('vt', JSON.stringify([...seen, value]));
            };
            globalThis.addEventListener('pagereveal', event => {
                if (!event.viewTransition) return;
                event.viewTransition.ready.then(
                    () =>
                        record(
                            [...document.querySelectorAll('[data-vt]')]
                                .map(el => getComputedStyle(el).viewTransitionName)
                                .filter(name => name !== 'none')
                                .sort()
                        ),
                    () => record('skipped')
                );
            });
        });
    });

    const recorded = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('vt') ?? '[]'));

    test('are given for the morph, then taken off again', async ({ page }) => {
        await page.goto('/');
        await page
            .locator('.lead-card[data-project="health"] a[href="/projects/health/"]')
            .first()
            .click();
        await page.waitForURL('**/projects/health/');

        // While the transition ran, the page's image and title were named...
        await expect
            .poll(async () => (await recorded(page)).at(-1))
            .toEqual(['project-media', 'project-title']);
        // ...and once it is over nothing keeps a name (a theme switch would split it out)
        await expect.poll(() => currentNames(page)).toEqual([]);
    });

    test('never leave two cards sharing a name after going back and opening another', async ({
        page,
    }) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

        await page.goto('/');
        const links = page.locator('#projects [data-project] a[href^="/projects/"]');
        const first = await links.nth(0).getAttribute('href');
        const second = (
            await links.evaluateAll(anchors => anchors.map(a => a.getAttribute('href')))
        ).find(href => href !== first);

        await page.locator(`#projects a[href="${first}"]`).first().click();
        await page.waitForURL(`**${first}`);
        await page.goBack();
        await page.waitForURL('**/');
        await expect.poll(() => currentNames(page)).toEqual([]);

        await page.locator(`#projects a[href="${second}"]`).first().click();
        await page.waitForURL(`**${second}`);
        await expect
            .poll(async () => (await recorded(page)).at(-1))
            .toEqual(['project-media', 'project-title']);
        expect(await recorded(page)).not.toContain('skipped');
        expect(errors).toEqual([]);
    });

    test('are cleared when a page comes back from the back/forward cache', async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => {
            document.querySelector('[data-vt="media"]').style.viewTransitionName = 'project-media';
        });
        expect(await currentNames(page)).toEqual(['project-media']);

        await page.evaluate(() => {
            const restored = new globalThis.PageTransitionEvent('pageshow', { persisted: true });
            globalThis.dispatchEvent(restored);
        });
        expect(await currentNames(page)).toEqual([]);
    });
});
