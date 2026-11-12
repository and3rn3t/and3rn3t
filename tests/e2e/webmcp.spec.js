/**
 * WebMCP (modules/webmcp.js): in a browser that has document.modelContext the page registers its
 * tools, and they work on the real page; in one that does not, the module is never downloaded.
 *
 * The browsers under test have no WebMCP, so a fake modelContext is put in place before the page
 * runs. It records what the page registers, the way the real one would hand it to an agent.
 */
import { test, expect } from './fixtures.js';

const withModelContext = () => {
    globalThis.__tools = new Map();
    globalThis.__signals = [];
    Object.defineProperty(document, 'modelContext', {
        configurable: true,
        value: {
            async registerTool(tool, options) {
                if (globalThis.__tools.has(tool.name)) throw new Error('already registered');
                globalThis.__tools.set(tool.name, tool);
                globalThis.__signals.push(options?.signal);
            },
        },
    });
};

/** Call a registered tool from inside the page, as the browser's agent would. */
const call = (page, name, input = {}) =>
    page.evaluate(
        async ({ name: toolName, input: args }) => {
            try {
                return { ok: await globalThis.__tools.get(toolName).execute(args, {}) };
            } catch (error) {
                return { error: error.message };
            }
        },
        { name, input }
    );

test.describe('a browser with WebMCP', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(withModelContext);
        await page.goto('/');
        await page.waitForFunction(() => globalThis.__tools.size >= 5, null, { timeout: 10000 });
    });

    test('is offered the five tools, each with a description and a schema', async ({ page }) => {
        const tools = await page.evaluate(() =>
            [...globalThis.__tools.values()].map(t => ({
                name: t.name,
                described: t.description.length > 30,
                schema: t.inputSchema.type,
            }))
        );
        expect(tools.map(t => t.name)).toEqual([
            'search_site',
            'list_projects',
            'open_project',
            'set_theme',
            'draft_contact_message',
        ]);
        for (const t of tools) expect(t).toMatchObject({ described: true, schema: 'object' });
    });

    test('search_site finds a real project and a real section', async ({ page }) => {
        const { ok } = await call(page, 'search_site', { query: 'health' });
        expect(ok.results.map(r => r.type)).toContain('project');
        expect(ok.results.find(r => r.type === 'project').url).toMatch(/^\/projects\//);
        const sections = await call(page, 'search_site', { query: 'contact' });
        expect(sections.ok.results.map(r => r.url)).toContain('#contact');
    });

    test('list_projects lists the projects the page shows', async ({ page }) => {
        const { ok } = await call(page, 'list_projects');
        expect(ok.length).toBeGreaterThan(10);
        const health = ok.find(project => project.name === 'health');
        expect(health.url).toBe('/projects/health/');
        const typescript = await call(page, 'list_projects', { technology: 'typescript' });
        expect(typescript.ok.length).toBeGreaterThan(0);
        expect(typescript.ok.length).toBeLessThan(ok.length);
    });

    test('open_project takes the visitor to the project page, and names the projects if it is wrong', async ({
        page,
    }) => {
        // Before leaving: the tools live on this page only
        expect((await call(page, 'open_project', { name: 'nope' })).error).toMatch(
            /No project called/
        );
        const [response] = await Promise.all([
            page.waitForURL('**/projects/health/'),
            call(page, 'open_project', { name: 'health' }),
        ]);
        expect(response).toBeUndefined();
        await expect(page.locator('h1')).toBeVisible();
    });

    test('set_theme switches the page theme, and does nothing if it is already right', async ({
        page,
    }) => {
        const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
        const start = await theme();
        const other = start === 'dark' ? 'light' : 'dark';
        await call(page, 'set_theme', { theme: other });
        await expect.poll(theme).toBe(other);
        await call(page, 'set_theme', { theme: other });
        await expect.poll(theme).toBe(other);
        await call(page, 'set_theme', { theme: start });
        await expect.poll(theme).toBe(start);
        expect((await call(page, 'set_theme', { theme: 'blue' })).error).toMatch(/light.*dark/);
    });

    test('draft_contact_message fills the form, brings it into view and sends nothing', async ({
        page,
    }) => {
        // Never let a test reach the real inbox, whatever it does
        await page.route('https://formspree.io/**', route => route.abort());
        // The form's own address: the page also POSTs a view count, which is not a message
        const sent = [];
        page.on('request', request => {
            if (request.method() === 'POST' && request.url().includes('formspree')) {
                sent.push(request.url());
            }
        });
        const draft = {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            subject: 'About a project',
            message: 'I would like to talk about working together.',
        };
        const { ok } = await call(page, 'draft_contact_message', draft);
        expect(ok).toMatchObject({ drafted: true, sent: false });
        await expect(page.locator('#name')).toHaveValue(draft.name);
        await expect(page.locator('#message')).toHaveValue(draft.message);
        await expect(page.locator('#website-url')).toHaveValue(''); // the bots' trap is untouched
        await expect(page.locator('#contact-form')).toBeInViewport();
        await page.waitForTimeout(500);
        expect(sent).toEqual([]); // nothing was submitted
        await expect(page.locator('#submit-button')).toBeEnabled(); // the person still has to press it
    });

    test('draft_contact_message refuses a draft the form would refuse', async ({ page }) => {
        const { error } = await call(page, 'draft_contact_message', {
            name: 'A',
            email: 'ada@example.com',
            subject: 'About a project',
            message: 'I would like to talk about working together.',
        });
        expect(error).toMatch(/name must be 2 to 100/);
        await expect(page.locator('#name')).toHaveValue('');
    });

    test('take the tools back when the page is hidden (the signal is aborted)', async ({
        page,
    }) => {
        expect(
            await page.evaluate(() =>
                globalThis.__signals.every(signal => signal.aborted === false)
            )
        ).toBe(true);
        await page.evaluate(() => globalThis.dispatchEvent(new Event('pagehide')));
        expect(
            await page.evaluate(() => globalThis.__signals.every(signal => signal.aborted))
        ).toBe(true);
    });
});

test.describe('a browser without WebMCP', () => {
    // The point of loading it on demand: nobody else pays for it
    test('is never sent the module', async ({ page }) => {
        const requested = [];
        page.on('request', request => requested.push(new URL(request.url()).pathname));
        await page.goto('/');
        await page
            .waitForFunction(() => Boolean(globalThis.appState?.managers?.views), null, {
                timeout: 10000,
            })
            .catch(() => {});
        await page.waitForTimeout(2500); // past the point where main.js would have started it
        expect(requested.filter(path => path.includes('webmcp'))).toEqual([]);
        expect(await page.evaluate(() => globalThis.appState.managers.webmcp)).toBeUndefined();
    });
});
