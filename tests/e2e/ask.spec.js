/**
 * Ask the portfolio (`ask` lab switch, modules/ask.js, the command palette): off unless switched on,
 * never loaded without the Prompt API, and with one (faked here: headless Chromium has no model) the
 * model's picks come back as the palette's own items for real pages. The model only chooses.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const read = file => JSON.parse(readFileSync(join(import.meta.dirname, '../../', file), 'utf8'));
const [project] = read('projects-data.json').projects;
const [post] = read('posts-data.json').posts;
const PROJECT_ID = `project:${project.name}`;
const POST_ID = `post:${post.slug}`;
const QUESTION = 'which page is about how this site works inside?';

/** A Prompt API that picks what the test says, and keeps what it was given. */
const fakePromptApi = ({ state = 'available', picks, fail = false }) => {
    window.__ask = { created: [], prompted: [], destroyed: 0 };
    window.LanguageModel = {
        availability: async () => state,
        async create(options) {
            window.__ask.created.push({
                system: options.initialPrompts?.[0]?.content,
                expectedInputs: options.expectedInputs,
            });
            options.monitor?.({
                addEventListener(type, listener) {
                    if (type === 'downloadprogress') setTimeout(() => listener({ loaded: 0.5 }), 0);
                },
            });
            return {
                async prompt(question, promptOptions) {
                    window.__ask.prompted.push({
                        question,
                        enumIds: promptOptions.responseConstraint?.properties?.picks?.items?.enum,
                    });
                    if (fail) throw new Error('no model');
                    return JSON.stringify({ picks });
                },
                destroy() {
                    window.__ask.destroyed++;
                },
            };
        },
    };
};

const withModel = (page, options) =>
    page.addInitScript(fakePromptApi, { picks: [PROJECT_ID, POST_ID], ...options });
// Chromium already exposes LanguageModel (the model is what is missing), so "no API" has to be made
const withoutModel = page => page.addInitScript(() => delete window.LanguageModel);

const openPalette = async page => {
    await page.keyboard.press('Control+k');
    await page.locator('#global-search-modal[open]').waitFor();
};
const askItem = page => page.locator('.palette-item').filter({ hasText: 'Ask:' });

test.describe('off by default', () => {
    test('a plain visit has no Ask option and never loads the module, even with the API', async ({
        page,
    }) => {
        await withModel(page, {});
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/');
        await page.waitForSelector('#projects .lead-card');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(page.locator('#search-results-status')).toHaveText(/No matches|result/);
        await expect(askItem(page)).toHaveCount(0);
        expect(requested).not.toContain('/modules/ask.js');
    });

    test('the switch on but no Prompt API: no option', async ({ page }) => {
        await withoutModel(page);
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(page.locator('#search-results-status')).toHaveText(/No matches|result/);
        await expect(askItem(page)).toHaveCount(0);
        expect(requested).not.toContain('/modules/ask.js');
    });

    test('a model that says it is unavailable: no option', async ({ page }) => {
        await withModel(page, { state: 'unavailable' });
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(page.locator('#search-results-status')).toHaveText(/No matches|result/);
        await expect(askItem(page)).toHaveCount(0);
    });
});

test.describe('with ?lab=ask and the API', () => {
    test('offers Ask for a sentence, not for a word or two', async ({ page }) => {
        await withModel(page, {});
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type('hea');
        await expect(page.locator('.palette-item').first()).toBeVisible();
        await expect(askItem(page)).toHaveCount(0);
        await page.keyboard.type('lth projects');
        await expect(askItem(page)).toHaveCount(1);
        await expect(page.locator('.palette-item').first()).toContainText('Ask:');
    });

    test("Enter on Ask shows the picked pages as the palette's own items, with the note", async ({
        page,
    }) => {
        await withModel(page, {});
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(askItem(page)).toHaveCount(1);
        await page.keyboard.press('Enter');

        const note = page.locator('.palette-note');
        await expect(note).toContainText('Picked on this device');
        await expect(note).toContainText('It can be wrong');
        const items = page.locator('.palette-item');
        await expect(items).toHaveCount(2);
        // Their words are the site's own, not the model's
        await expect(items.nth(0)).toContainText(project.displayName || project.name);
        await expect(items.nth(1)).toContainText(post.title);
        await expect(askItem(page)).toHaveCount(0);
        // The palette stays open, and the model was told only what the test says it should be
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
        const ask = await page.evaluate(() => window.__ask);
        expect(ask.created[0].system).toContain(`${PROJECT_ID} |`);
        expect(ask.created[0].system).not.toContain('pirate');
        expect(ask.prompted[0].question).toBe(QUESTION);
        expect(ask.prompted[0].enumIds).toContain(POST_ID);
        expect(ask.destroyed).toBe(1);
    });

    test('a pick opens the real page', async ({ page }) => {
        await withModel(page, { picks: [POST_ID] });
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(askItem(page)).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(page.locator('.palette-item')).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new RegExp(`/posts/${post.slug}/`));
    });

    test('an id the model made up is dropped, and the real one stays', async ({ page }) => {
        await withModel(page, { picks: ['project:made-up', PROJECT_ID, 'post:nope'] });
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(askItem(page)).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(page.locator('.palette-item')).toHaveCount(1);
        await expect(page.locator('.palette-item').first()).toContainText(
            project.displayName || project.name
        );
    });

    test('no pick means a plain search, and the note says so', async ({ page }) => {
        await withModel(page, { picks: [] });
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type('hello world today');
        await expect(askItem(page)).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(page.locator('.palette-note')).toContainText(
            'Nothing on the site seems to answer that'
        );
    });

    test('a model that fails says so and leaves the plain search', async ({ page }) => {
        await withModel(page, { fail: true });
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(askItem(page)).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(page.locator('.palette-note')).toContainText('did not work on this device');
        await expect(page.locator('#global-search-modal')).toHaveAttribute('open', '');
    });

    test('typing again clears the answer and its note', async ({ page }) => {
        await withModel(page, {});
        await page.goto('/?lab=ask');
        await openPalette(page);
        await page.keyboard.type(QUESTION);
        await expect(askItem(page)).toHaveCount(1);
        await page.keyboard.press('Enter');
        await expect(page.locator('.palette-note')).toBeVisible();
        await page.keyboard.type(' now');
        await expect(page.locator('.palette-note')).toHaveCount(0);
        await expect(askItem(page)).toHaveCount(1);
    });

    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme with an answer shown`, async ({
            page,
        }) => {
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            await withModel(page, {});
            await page.goto('/?lab=ask');
            await openPalette(page);
            await page.keyboard.type(QUESTION);
            await expect(askItem(page)).toHaveCount(1);
            await page.keyboard.press('Enter');
            await expect(page.locator('.palette-item')).toHaveCount(2);
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .exclude('iframe[src*="cloudflare"]')
                .analyze();
            expect(results.violations).toEqual([]);
        });
    }
});
