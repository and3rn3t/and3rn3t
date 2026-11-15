/**
 * Post tools (`post-tools` lab switch, modules/post-tools.js): off unless switched on, never
 * loaded without a browser API, and with one (faked here: headless Chromium has no model) the key
 * points and translation appear with their labels. Real output needs real Chrome and is checked by hand.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const [{ slug }] = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../posts-data.json'), 'utf8')
).posts;
const POST = `/posts/${slug}/`;

/** A page with the two APIs, behaving the way Chrome's do: the model downloads on first create(). */
const fakeBuiltInAi = ({ summarizer = true, translator = true, availability = 'downloadable' }) => {
    if (summarizer) {
        window.Summarizer = {
            availability: async () => availability,
            async create(options) {
                options.monitor?.(
                    Object.assign(new EventTarget(), {
                        addEventListener(type, listener) {
                            if (type === 'downloadprogress')
                                setTimeout(() => listener({ loaded: 0.5 }), 0);
                        },
                    })
                );
                window.__summarizerOptions = options;
                return {
                    summarize: async () => '- First point\n- Second point\n- Third point',
                    destroy() {},
                };
            },
        };
    }
    if (translator) {
        window.Translator = {
            availability: async () => availability,
            create: async options => ({
                translate: async text => `[${options.targetLanguage}] ${text}`,
                destroy() {},
            }),
        };
    }
};

const withApis = (page, options = {}) => page.addInitScript(fakeBuiltInAi, options);

// Chromium already exposes these (the model is what is missing), so "no API" has to be made
const withoutApis = (page, names = ['Summarizer', 'Translator']) =>
    page.addInitScript(list => list.forEach(name => delete window[name]), names);

test.describe('off by default', () => {
    test('a post has no panel and never loads the module, even in a browser with the APIs', async ({
        page,
    }) => {
        await withApis(page);
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto(POST);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
        expect(requested).not.toContain('/modules/post-tools.js');
        await expect(page.locator('.post-tools')).toHaveCount(0);
    });

    test('the switch on, but a browser with neither API, never loads the module', async ({
        page,
    }) => {
        await withoutApis(page);
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto(`${POST}?lab=post-tools`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);
        expect(requested).not.toContain('/modules/post-tools.js');
        await expect(page.locator('.post-tools')).toHaveCount(0);
    });

    test('pages that are not posts get no panel', async ({ page }) => {
        await withApis(page);
        await page.goto('/status/?lab=post-tools');
        await page.waitForTimeout(1500);
        await expect(page.locator('.post-tools')).toHaveCount(0);
    });
});

test.describe('with ?lab=post-tools and the APIs', () => {
    test('key points appear, labelled, with the download shown first', async ({ page }) => {
        await withApis(page);
        await page.goto(`${POST}?lab=post-tools`);
        const panel = page.locator('.post-tools');
        await expect(panel).toContainText('Nothing is sent anywhere');
        await expect(panel).toContainText('the post is the source');
        await panel.getByRole('button', { name: 'Key points' }).click();
        await expect(panel.locator('.post-tools__points li')).toHaveText([
            'First point',
            'Second point',
            'Third point',
        ]);
        await expect(panel.getByRole('status')).toContainText('made on this device');
        expect(await page.evaluate(() => window.__summarizerOptions)).toMatchObject({
            type: 'key-points',
            format: 'plain-text',
            outputLanguage: 'en',
        });
    });

    test('a translation covers the prose, not the code', async ({ page }) => {
        await withApis(page);
        await page.goto(`${POST}?lab=post-tools`);
        const expected = await page.evaluate(
            () =>
                [
                    ...document.querySelectorAll(
                        '.prose p, .prose h2, .prose h3, .prose h4, .prose li'
                    ),
                ]
                    .filter(el => !el.closest('pre, figure, table'))
                    .filter(el => !(el.tagName === 'LI' && el.querySelector('p, ul, ol')))
                    .filter(el => el.textContent.trim()).length
        );
        const panel = page.locator('.post-tools');
        await panel.getByRole('combobox').selectOption('fr');
        await panel.getByRole('button', { name: 'Read in this language' }).click();
        await expect(panel.locator('.post-tools__line')).toHaveCount(expected);
        await expect(panel.locator('.post-tools__line').first()).toContainText('[fr] ');
        await expect(panel.locator('.post-tools__line').first()).toHaveAttribute('lang', 'fr');
        await panel.getByRole('button', { name: 'Clear' }).click();
        await expect(panel.locator('.post-tools__line')).toHaveCount(0);
    });

    test('says so when the browser cannot run it', async ({ page }) => {
        await withApis(page, { availability: 'unavailable' });
        await page.goto(`${POST}?lab=post-tools`);
        const panel = page.locator('.post-tools');
        await panel.getByRole('button', { name: 'Key points' }).click();
        await expect(panel.getByRole('status')).toContainText('cannot run the summarizer');
        await panel.getByRole('button', { name: 'Read in this language' }).click();
        await expect(panel.getByRole('status')).toContainText('cannot translate');
    });

    test('a failure is reported and leaves the post alone', async ({ page }) => {
        await withoutApis(page, ['Translator']);
        await page.addInitScript(() => {
            window.Summarizer = {
                availability: async () => 'available',
                create: async () => {
                    throw new DOMException('no', 'NotAllowedError');
                },
            };
        });
        await page.goto(`${POST}?lab=post-tools`);
        const panel = page.locator('.post-tools');
        await expect(panel.getByRole('button', { name: 'Read in this language' })).toHaveCount(0);
        await panel.getByRole('button', { name: 'Key points' }).click();
        await expect(panel.getByRole('status')).toContainText('did not work');
        await expect(page.locator('.prose').first()).toBeVisible();
    });

    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme, with results shown`, async ({
            page,
        }) => {
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            await withApis(page);
            await page.goto(`${POST}?lab=post-tools`);
            const panel = page.locator('.post-tools');
            await panel.getByRole('button', { name: 'Key points' }).click();
            await expect(panel.locator('.post-tools__points li')).toHaveCount(3);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .exclude('iframe[src*="cloudflare"]')
                .analyze();
            expect(results.violations).toEqual([]);
        });
    }
});
