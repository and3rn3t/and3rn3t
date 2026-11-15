/**
 * The agent view (`agent-view` lab switch, modules/agent-view.js): off unless switched on, and when
 * on it shows the page's Markdown and the MCP tools. The local server has no Cloudflare converter
 * and no /mcp, so both are answered here.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const [{ slug }] = JSON.parse(
    readFileSync(join(import.meta.dirname, '../../posts-data.json'), 'utf8')
).posts;
const POST = `/posts/${slug}/`;

const TOOLS = {
    jsonrpc: '2.0',
    id: 1,
    result: {
        tools: [
            { name: 'get_profile', title: 'Get profile' },
            { name: 'list_posts', title: 'List posts' },
        ],
    },
};

/** Cloudflare's part: the same URL answers Markdown to `Accept: text/markdown`. */
async function serveMarkdown(page, path) {
    await page.route(`**${path}`, route => {
        const accept = route.request().headers().accept ?? '';
        if (!accept.includes('text/markdown')) return route.fallback();
        return route.fulfill({
            status: 200,
            headers: { 'content-type': 'text/markdown; charset=utf-8', 'x-markdown-tokens': '321' },
            body: '# A post\n\nThe converted text.',
        });
    });
    await page.route('**/mcp', route =>
        route.fulfill({
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
            body: `event: message\ndata: ${JSON.stringify(TOOLS)}\n\n`,
        })
    );
}

test.describe('off by default', () => {
    for (const path of ['/', POST]) {
        test(`${path} has no button and never loads the module`, async ({ page }) => {
            const requested = [];
            page.on('request', request => requested.push(new URL(request.url()).pathname));
            await page.goto(path);
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000); // past the idle callbacks
            expect(requested).not.toContain('/modules/agent-view.js');
            await expect(page.locator('.agent-view-button')).toHaveCount(0);
        });
    }
});

test.describe('with ?lab=agent-view', () => {
    for (const path of ['/', POST]) {
        test(`${path} shows the Markdown and the tools`, async ({ page }) => {
            await serveMarkdown(page, path);
            await page.goto(`${path}?lab=agent-view`);
            await page.locator('.agent-view-button').click();
            const dialog = page.locator('dialog.agent-view');
            await expect(dialog).toBeVisible();
            await expect(dialog).toContainText('Markdown, about 321 tokens');
            await expect(dialog.locator('pre')).toContainText('The converted text.');
            await expect(dialog.locator('li code')).toHaveText(['get_profile', 'list_posts']);
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
        });
    }

    test('says so when the server only has HTML, and when /mcp is not there', async ({ page }) => {
        await page.goto(`${POST}?lab=agent-view`);
        await page.locator('.agent-view-button').click();
        const dialog = page.locator('dialog.agent-view');
        await expect(dialog).toContainText('sent HTML back');
        await expect(dialog).toContainText('did not answer here');
        await expect(dialog.locator('pre')).toBeHidden();
    });

    test('never leaves Markdown where the page itself would read it', async ({ page }) => {
        await serveMarkdown(page, POST);
        await page.goto(`${POST}?lab=agent-view`);
        await page.locator('.agent-view-button').click();
        await expect(page.locator('dialog.agent-view pre')).toContainText('The converted text.');
        await page.reload();
        // The page itself is still the HTML page, not the Markdown that was fetched for it
        await expect(page.locator('h1').first()).toBeVisible();
        expect(await page.evaluate(() => document.contentType)).toBe('text/html');
    });

    for (const theme of ['light', 'dark']) {
        test(`has no axe violations in the ${theme} theme, dialog open`, async ({ page }) => {
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            await serveMarkdown(page, POST);
            await page.goto(`${POST}?lab=agent-view`);
            await page.locator('.agent-view-button').click();
            await expect(page.locator('dialog.agent-view pre')).toBeVisible();
            const results = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
                .exclude('iframe[src*="cloudflare"]')
                .analyze();
            expect(results.violations).toEqual([]);
        });
    }
});
