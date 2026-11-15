/**
 * The two MCP Apps the Worker serves (show_project, show_status), run the way a host runs them:
 * inside an iframe, through the MCP Apps SDK's own host code, handed a tool result. Catches an app
 * that never connects, a client script that no longer loads, or a view that stops drawing, which
 * the Worker's unit tests cannot (they only check what the server returns).
 *
 * The apps import their client from a pinned jsDelivr URL; here that URL is answered from the
 * installed package, so the run needs no network and fails if the pin and the install drift apart.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'vite';
import { APP_CLIENT_URL, PROJECT_VIEW_HTML } from '../../worker/mcp-app-view.js';
import { STATUS_VIEW_HTML } from '../../worker/mcp-app-status.js';
import { test, expect, STATS_FIXTURE } from './fixtures.js';

const ROOT = join(import.meta.dirname, '..', '..');
// Read from the folder: the package's "exports" do not expose package.json or dist/
const APPS_DIR = join(ROOT, 'node_modules', '@modelcontextprotocol', 'ext-apps');

/** The same shape get_project and show_project return. */
const PROJECT = {
    name: 'health',
    title: 'VitalSense',
    description: 'Gait analysis with iPhone LiDAR.',
    category: 'Health & Wellness',
    status: 'Active Development',
    technologies: ['TypeScript', 'HealthKit'],
    url: 'https://andernet.dev/projects/health/',
    source: 'https://github.com/and3rn3t/health',
    overview: 'The long write-up.',
    highlights: ['Live deployment'],
    metrics: [{ value: '30 fps', label: 'depth stream' }],
    live_demo: 'https://health.andernet.dev',
};

const asResult = data => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
});

let hostBundle;

test.beforeAll(async () => {
    // The host is bundled once per worker: the SDK's host code imports packages the browser cannot resolve
    const { output } = (
        await build({
            configFile: false,
            logLevel: 'silent',
            root: ROOT,
            build: {
                write: false,
                minify: false,
                lib: {
                    entry: join(ROOT, 'tests/e2e/support/mcp-host.entry.mjs'),
                    formats: ['iife'],
                    name: 'McpHost',
                },
            },
        })
    )[0] ?? { output: [] };
    hostBundle = output[0].code;
});

test.beforeEach(async ({ page }) => {
    // Serve the pinned client from the installed package
    const client = readFileSync(join(APPS_DIR, 'dist', 'src', 'app-with-deps.js'), 'utf8');
    await page.route(APP_CLIENT_URL, route =>
        route.fulfill({ contentType: 'text/javascript', body: client })
    );
    await page.setContent('<body style="margin:8px"><p>host</p></body>');
    await page.addScriptTag({ content: hostBundle });
});

/** Run an app and return its frame, with console errors collected. */
async function open(page, html, result) {
    const errors = [];
    page.on('console', message => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', error => errors.push(String(error)));
    await page.evaluate(
        ([markup, toolResult]) => window.mountApp(markup, toolResult),
        [html, result]
    );
    return { frame: page.frameLocator('#app'), errors };
}

test.describe('the status panel (show_status)', () => {
    test('connects to the host and draws the stats it is handed', async ({ page }) => {
        const { frame, errors } = await open(page, STATUS_VIEW_HTML, asResult(STATS_FIXTURE));

        await expect(frame.locator('.headline')).toHaveText('andernet.dev is answering');
        await expect(frame.locator('.cell')).toHaveCount(STATS_FIXTURE.uptime.days.length);
        await expect(frame.locator('.stat__value').first()).not.toHaveText('');
        await expect(frame.locator('.tools li')).toHaveCount(STATS_FIXTURE.mcp.length);
        await expect(frame.locator('a')).toHaveAttribute('href', 'https://andernet.dev/status/');
        expect(errors).toEqual([]);
    });

    test('draws from the text block when the host passes no structured content', async ({
        page,
    }) => {
        const { content } = asResult(STATS_FIXTURE);
        const { frame } = await open(page, STATUS_VIEW_HTML, { content });
        await expect(frame.locator('.headline')).toHaveText('andernet.dev is answering');
    });

    test('says so when the numbers are missing, and not that all is well', async ({ page }) => {
        const { frame, errors } = await open(
            page,
            STATUS_VIEW_HTML,
            asResult({ generatedAt: new Date().toISOString(), api: null, uptime: null })
        );
        await expect(frame.locator('.headline')).toHaveText('No recent check');
        expect(errors).toEqual([]);
    });
});

test.describe('the project card (show_project)', () => {
    test('connects to the host and draws the project it is handed', async ({ page }) => {
        const { frame, errors } = await open(page, PROJECT_VIEW_HTML, asResult(PROJECT));

        await expect(frame.locator('#title')).toHaveText('VitalSense');
        await expect(frame.locator('#description')).toHaveText(PROJECT.description);
        await expect(frame.locator('#tech li')).toHaveText(PROJECT.technologies);
        const links = frame.locator('#links a');
        await expect(links).toHaveCount(3); // page, source, live demo
        await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
        expect(errors).toEqual([]);
    });

    test('drops a link that is not https, and keeps markup as text', async ({ page }) => {
        const { frame } = await open(
            page,
            PROJECT_VIEW_HTML,
            asResult({
                ...PROJECT,
                title: '<img src=x onerror=alert(1)>',
                source: 'javascript:alert(1)',
            })
        );
        await expect(frame.locator('#title')).toHaveText('<img src=x onerror=alert(1)>');
        await expect(frame.locator('#title img')).toHaveCount(0);
        await expect(frame.locator('#links a')).toHaveCount(2); // the javascript: link is gone
    });
});

test('the pinned client version in the apps is the one installed', () => {
    const pinned = APP_CLIENT_URL.match(/ext-apps@([^/]+)\//)?.[1];
    const installed = JSON.parse(readFileSync(join(APPS_DIR, 'package.json'), 'utf8')).version;
    expect(installed).toBe(pinned);
});
