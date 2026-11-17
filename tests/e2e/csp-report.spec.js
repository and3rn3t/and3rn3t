/**
 * The report-only Content-Security-Policy, end to end in a real browser: the policy the zone sends
 * (scripts/zone-headers.mjs) is put on the local pages, and the report Chromium actually posts is
 * read by the Worker's own parser (worker/csp-report.js). So a change to the policy, or to what a
 * browser sends, that the Worker could not read fails here and not in production.
 */
import { join } from 'node:path';
import { test, expect } from './fixtures.js';
import { buildCsp, inlineHashes } from '../../scripts/zone-headers.mjs';
import { readFileSync } from 'node:fs';
import { WORKER_BASE } from '../../modules/config.js';
import { blockedSource, directiveName, parseReports, sinkName } from '../../worker/csp-report.js';

const ROOT = join(import.meta.dirname, '..', '..');
const [{ slug: POST }] = JSON.parse(readFileSync(join(ROOT, 'posts-data.json'), 'utf8')).posts;
const KONAMI = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a',
];

/** Serve the real policy, report-only, on every page, and keep the reports the browser posts. */
async function withPolicy(page) {
    const policy = buildCsp(inlineHashes(ROOT));
    const posted = [];
    await page.route('**/*', async route => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        return route.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy-report-only': policy },
        });
    });
    await page.route('**/api/csp-report', route => {
        posted.push({
            type: route.request().headers()['content-type'],
            body: route.request().postData(),
        });
        return route.fulfill({ status: 204 });
    });
    return posted;
}

test.describe('the report-only policy', () => {
    // Every first-party innerHTML and script src goes through modules/utils/html.js; this is the
    // measure for it: the pages, in both themes, and the interactions that reach each sink (the
    // palette's results, the guestbook, the Turnstile loader, the activity widget, the easter egg)
    for (const theme of ['light', 'dark']) {
        test(`the site itself breaks none of it, in the ${theme} theme`, async ({ page }) => {
            test.setTimeout(45000);
            const posted = await withPolicy(page);
            await page.addInitScript(value => localStorage.setItem('theme', value), theme);
            // Entries to draw, and a stand-in for the captcha script (the real one is not loaded here)
            await page.route(`${WORKER_BASE}/guestbook`, route =>
                route.request().method() === 'GET'
                    ? route.fulfill({
                          contentType: 'application/json',
                          headers: { 'access-control-allow-origin': '*' },
                          body: JSON.stringify([
                              {
                                  name: 'A <b>visitor</b>',
                                  message: 'Hello',
                                  date: '2026-01-01T00:00:00Z',
                              },
                          ]),
                      })
                    : route.fallback()
            );
            await page.route('https://challenges.cloudflare.com/**', route =>
                route.fulfill({
                    contentType: 'application/javascript',
                    body: 'window.turnstile = { render: (el, options) => { window.__turnstile = options; return "w"; }, reset() {}, remove() {} };',
                })
            );

            for (const path of ['/status/', '/lab/', `/posts/${POST}/`, '/404.html']) {
                await page.goto(path);
                await page.waitForTimeout(900);
            }

            await page.goto('/');
            await page.waitForSelector('#projects .lead-card');
            await page.evaluate(async () => {
                for (let y = 0; y < document.body.scrollHeight; y += 700) {
                    window.scrollTo(0, y);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            });
            // The palette: results, then none, then closed; keyboard help
            await page.keyboard.press('Control+k');
            await page.keyboard.type('health');
            await page.waitForSelector('.palette-item');
            await page.keyboard.type('zzzzqq');
            await page.waitForSelector('.palette-no-results');
            await page.keyboard.press('Escape');
            await page.keyboard.press('?');
            await page.keyboard.press('Escape');
            // The hidden terminal
            for (const key of KONAMI) await page.keyboard.press(key);
            await expect(page.locator('.dev-terminal-overlay')).toHaveCount(1);
            await page.waitForTimeout(1500);
            await page.keyboard.press('Escape'); // it covers the page
            await expect(page.locator('.dev-terminal-overlay.visible')).toHaveCount(0);

            // The guestbook's tab loads it and the captcha script (through the policy), it draws its
            // entries (markup from escaped data: the name shows as text), and a signed entry is added
            await page.locator('#contact-tab-guestbook').click();
            await expect(page.locator('.guestbook__entry')).toHaveCount(1);
            await expect(page.locator('.guestbook__name')).toHaveText('A <b>visitor</b>');
            await expect(page.locator('script[src*="challenges.cloudflare.com"]')).toHaveCount(1);
            await page.waitForFunction(() => window.__turnstile);
            await page.evaluate(() => window.__turnstile.callback('token'));
            await page.locator('#guestbook-form [name="name"]').fill('Test');
            await page.locator('#guestbook-form [name="message"]').fill('Hello');
            await page.locator('#guestbook-form button[type="submit"]').click();
            await expect(page.locator('.guestbook__entry--new')).toHaveCount(1);
            expect(posted.map(report => report.body)).toEqual([]);
        });
    }

    test('a string that reaches innerHTML without the policy is reported, and the Worker reads which sink', async ({
        page,
    }) => {
        const posted = await withPolicy(page);
        await page.goto('/');
        await page.waitForTimeout(800);
        expect(posted).toHaveLength(0);

        await page.evaluate(() => {
            document.body.append(Object.assign(document.createElement('div'), { id: 'probe' }));
            document.getElementById('probe').innerHTML = '<b>a plain string</b>';
        });
        await expect.poll(() => posted.length).toBeGreaterThan(0);

        const [parsed] = parseReports(posted[0].body);
        expect(directiveName(parsed.directive)).toBe('require-trusted-types-for');
        expect(sinkName(parsed.sample)).toBe('sink:element-innerhtml');
        // The page's own text is never part of what is kept
        expect(sinkName(parsed.sample)).not.toContain('plain');
    });

    test('a policy by another name is reported too: nothing else on the page may make one', async ({
        page,
    }) => {
        const posted = await withPolicy(page);
        await page.goto('/');
        await page.waitForTimeout(800);
        await page.evaluate(() => globalThis.trustedTypes.createPolicy('intruder', {}));
        await expect.poll(() => posted.length).toBeGreaterThan(0);
        const [parsed] = parseReports(posted[0].body);
        expect(directiveName(parsed.directive)).toBe('trusted-types');
    });

    test('a violation is posted to /api/csp-report, in a format the Worker reads', async ({
        page,
    }) => {
        const posted = await withPolicy(page);
        await page.goto('/');
        await page.waitForTimeout(800);
        expect(posted).toHaveLength(0); // clean before we break it

        // An inline script nobody hashed: exactly what the policy exists to catch
        await page.addScriptTag({ content: 'globalThis.__violation = 1;' });
        await expect.poll(() => posted.length).toBeGreaterThan(0);

        // Setting the script's text is also a Trusted Types sink, so that one report comes with it
        const [report] = posted;
        expect(report.type).toMatch(/csp-report|reports\+json/);
        const all = posted.flatMap(entry => parseReports(entry.body));
        const parsed = all.find(
            candidate => directiveName(candidate.directive) === 'script-src-elem'
        );
        expect(parsed, JSON.stringify(all)).toBeDefined();
        expect(blockedSource(parsed.blockedUrl)).toBe('inline');
        // (On the real site the page is andernet.dev, so the Worker keeps it; here it is localhost.)
        expect(new URL(parsed.documentUrl).pathname).toBe('/');
    });
});
