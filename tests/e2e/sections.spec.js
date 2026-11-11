/**
 * About (facts and the live GitHub band), Experience (folding jobs) and Writing (rows).
 */
import { test, expect } from './fixtures.js';

test.describe('About', () => {
    test('the facts come from the current role', async ({ page }) => {
        await page.goto('/');
        const facts = page.locator('#about-facts .facts');
        await expect(facts).toContainText('Software Engineer');
        await expect(facts).toContainText('Deere & Company');
        await expect(facts).toContainText('2021');
    });

    test('lists the tools as tags', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#about .about__aside .tag').first()).toBeVisible();
        expect(await page.locator('#about .about__aside .tag').count()).toBeGreaterThan(3);
    });
});

test.describe('the GitHub band', () => {
    test('fills in two real numbers and a chart', async ({ page }) => {
        await page.goto('/');
        const contributions = page.locator('[data-stat="contributions"]');
        const active = page.locator('[data-stat="active-repos"]');
        await expect(contributions).toHaveText(/^[\d,]+$/);
        await expect(active).toHaveText(/^\d+$/);
        await expect(page.locator('#contribution-graph .contrib__cell').first()).toBeAttached();

        // Only the two honest numbers: no total stars, no hard-coded "years on GitHub"
        await expect(page.locator('#github-band .stat')).toHaveCount(2);
        await expect(page.locator('#github-band')).not.toContainText(/stars|years on github/i);
    });

    test('"active" does not count forks or archived repositories', async ({ page }) => {
        await page.route('**/github-data.json', async route => {
            const response = await route.fetch();
            const data = await response.json();
            const recent = new Date().toISOString();
            data.repositories = [
                { name: 'mine', pushed_at: recent, fork: false, archived: false },
                { name: 'forked', pushed_at: recent, fork: true, archived: false },
                { name: 'old', pushed_at: recent, fork: false, archived: true },
                { name: 'stale', pushed_at: '2020-01-01T00:00:00Z', fork: false, archived: false },
            ];
            await route.fulfill({ response, json: data });
        });
        await page.goto('/');
        await expect(page.locator('[data-stat="active-repos"]')).toHaveText('1');
    });

    test('is hidden, rather than blank, when the data cannot be had', async ({ page }) => {
        await page.route('**/github-data.json', route => route.abort());
        await page.route('https://api.github.com/**', route => route.abort());
        await page.goto('/');
        // The API client retries with backoff before giving up, so this takes a few seconds
        await expect(page.locator('#github-band')).toBeHidden({ timeout: 20_000 });
    });

    test('a missing number stays a dash instead of claiming zero', async ({ page }) => {
        await page.route('**/github-data.json', async route => {
            const response = await route.fetch();
            const data = await response.json();
            data.contributions = null; // the calendar is unavailable, the repositories are not
            await route.fulfill({ response, json: data });
        });
        await page.goto('/');
        await expect(page.locator('[data-stat="active-repos"]')).toHaveText(/^\d+$/);
        await expect(page.locator('[data-stat="contributions"]')).toHaveText('\u2014');
        await expect(page.locator('#contribution-graph')).toBeHidden();
    });

    test('a user with no repositories has zero active, not a dash', async ({ page }) => {
        // An empty list is known data (getRepositories() throws when it is unavailable), so
        // the count is a real zero; only the missing calendar stays a dash.
        await page.route('**/github-data.json', async route => {
            const response = await route.fetch();
            const data = await response.json();
            data.repositories = [];
            data.contributions = null;
            await route.fulfill({ response, json: data });
        });
        await page.goto('/');
        await expect(page.locator('#github-band')).toBeVisible();
        await expect(page.locator('[data-stat="active-repos"]')).toHaveText('0');
        await expect(page.locator('[data-stat="contributions"]')).toHaveText('\u2014');
    });

    test('names the chart without claiming a time range, since the range depends on the screen', async ({
        page,
    }) => {
        // A phone shows 20 weeks and a wide screen a year; an explicit label overrides the
        // visible caption for screen readers, so it must be true of both.
        for (const width of [390, 1280]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto('/');
            await page.waitForSelector('.contrib__figure', { state: 'attached' });
            const label = await page.locator('.contrib__figure').getAttribute('aria-label');
            expect(label, `at ${width}px`).not.toMatch(/year|\d+ weeks|[\d,]{3,}/i);
        }
    });

    // The chart arrives after the page, from data that can be late. Its space has to be
    // reserved from its own geometry (rows of square cells), which depends on the width, so
    // check across widths, including those just under the 40rem breakpoint where a fixed
    // reservation was too small.
    for (const width of [360, 480, 540, 600, 639, 640, 1024, 1440]) {
        test(`the band does not change height when late data arrives, at ${width}px`, async ({
            page,
        }) => {
            await page.setViewportSize({ width, height: 900 });
            await page.route('**/github-data.json', async route => {
                await new Promise(resolve => setTimeout(resolve, 1200));
                await route.continue();
            });
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            const height = () =>
                page.evaluate(() =>
                    Math.round(
                        document.getElementById('github-band').getBoundingClientRect().height
                    )
                );
            await page.waitForTimeout(400);
            const before = await height();
            await page.waitForSelector('#contribution-graph .contrib__cell', { state: 'attached' });
            await page.waitForTimeout(200);
            expect(await height()).toBe(before);
        });
    }

    test('the numbers arriving does not move anything below them', async ({ page }) => {
        // The slots and the chart's space are reserved in the markup, so filling them in
        // changes no layout.
        await page.addInitScript(() => {
            window.__shifts = [];
            new PerformanceObserver(list => {
                for (const entry of list.getEntries()) {
                    if (!entry.hadRecentInput && entry.value > 0.002)
                        window.__shifts.push(entry.value);
                }
            }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto('/');
        await expect(page.locator('[data-stat="contributions"]')).toHaveText(/^[\d,]+$/);
        await page.waitForTimeout(500);
        expect(await page.evaluate(() => window.__shifts)).toEqual([]);
    });

    test.describe('on a phone', () => {
        test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

        test('shows the last 20 weeks, and says so', async ({ page }) => {
            await page.goto('/');
            // attached, not visible: on a phone the first cells are the hidden older weeks
            await page.waitForSelector('#contribution-graph .contrib__cell', { state: 'attached' });
            const visibleColumns = await page.evaluate(() => {
                const cells = [
                    ...document.querySelectorAll('.contrib__grid .contrib__cell'),
                ].filter(cell => cell.offsetParent);
                return new Set(cells.map(cell => getComputedStyle(cell).gridColumnStart)).size;
            });
            expect(visibleColumns).toBe(20);
            await expect(page.locator('.contrib__range--recent')).toBeVisible();
            await expect(page.locator('.contrib__range--year')).toBeHidden();
        });
    });

    test('shows the whole year on a wide screen, and says so', async ({ page }) => {
        await page.goto('/');
        // attached, not visible: on a phone the first cells are the hidden older weeks
        await page.waitForSelector('#contribution-graph .contrib__cell', { state: 'attached' });
        const columns = await page.evaluate(
            () =>
                new Set(
                    [...document.querySelectorAll('.contrib__grid .contrib__cell')].map(
                        cell => getComputedStyle(cell).gridColumnStart
                    )
                ).size
        );
        expect(columns).toBeGreaterThan(40);
        await expect(page.locator('.contrib__range--year')).toBeVisible();
        await expect(page.locator('.contrib__range--recent')).toBeHidden();
    });
});

test.describe('Experience', () => {
    test('the current role is open; the others are folded', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.job--current .job__more')).toHaveAttribute('open');
        const folded = page.locator('.job:not(.job--current) .job__more');
        expect(await folded.count()).toBeGreaterThan(0);
        for (const job of await folded.all()) await expect(job).not.toHaveAttribute('open');
    });

    test('a folded job opens to its highlights and technologies', async ({ page }) => {
        await page.goto('/');
        const job = page.locator('.job:not(.job--current) .job__more').first();
        await job.locator('summary').click();
        await expect(job.locator('.job__highlights')).toBeVisible();
    });

    test('company and school line up from row to row', async ({ page }) => {
        await page.goto('/');
        const lefts = await page
            .locator('.job__company, .edu-row__school')
            .evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().left)));
        expect(lefts.length).toBeGreaterThan(3);
        expect(new Set(lefts).size).toBe(1);
    });

    test('links to the résumé', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#experience a[href="/resume.pdf"]')).toBeVisible();
    });
});

/**
 * Click where a person would click: on the element's own spot. locator.click() refuses when
 * another element covers it, but a stretched link covering its row is exactly what is being tested.
 */
async function clickOnSpot(page, locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await page.mouse.click(box.x + 12, box.y + box.height / 2);
}

test.describe('Writing', () => {
    test('is a row per post, newest first', async ({ page }) => {
        await page.goto('/');
        const dates = await page
            .locator('#blog-posts .post-row__date')
            .evaluateAll(els => els.map(el => el.getAttribute('datetime')));
        expect(dates.length).toBeGreaterThan(1);
        expect(dates).toEqual([...dates].sort().reverse());
    });

    test('the whole row opens the post, not only its title', async ({ page }) => {
        await page.goto('/');
        const row = page.locator('#blog-posts .post-row').first();
        await clickOnSpot(page, row.locator('.post-row__summary'));
        await page.waitForURL(/\/posts\/[^/]+\/$/);
        await expect(page.locator('h1')).toBeVisible();
    });

    // The row is a plain stretched link, so it must not wait for any script. This failed in CI
    // when the row's click handler (in blog.js) had not loaded yet by the time the test clicked.
    test('opens the post even before blog.js has loaded', async ({ page }) => {
        await page.route('**/modules/blog.js', route => route.abort());
        await page.goto('/');
        await clickOnSpot(page, page.locator('#blog-posts .post-row__summary').first());
        await page.waitForURL(/\/posts\/[^/]+\/$/);
    });

    test.describe('with JavaScript disabled', () => {
        test.use({ javaScriptEnabled: false });

        test('clicking anywhere on a row opens the post', async ({ page }) => {
            await page.goto('/');
            await clickOnSpot(page, page.locator('#blog-posts .post-row__date').first());
            await page.waitForURL(/\/posts\/[^/]+\/$/);
        });
    });

    test('keyboard focus shows a ring around the whole row it covers', async ({ page }) => {
        await page.goto('/');
        const row = page.locator('#blog-posts .post-row').first();
        await row.locator('.post-row__title a').focus();
        await page.keyboard.press('Shift+Tab'); // move off and back so :focus-visible applies
        await page.keyboard.press('Tab');
        const outline = await row.evaluate(el => getComputedStyle(el).outlineStyle);
        expect(outline).toBe('solid');
    });
});
