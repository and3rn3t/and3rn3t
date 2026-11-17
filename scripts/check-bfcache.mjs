#!/usr/bin/env node
/**
 * Does a page come back from the back/forward cache? Loads each page in Chromium, goes to
 * about:blank and Back, and reports whether the same page (not a reload) answered, with the browser's own
 * reasons when it did not (the DevTools `Page.backForwardCacheNotUsed` event: the web-facing
 * `notRestoredReasons` are masked for privacy).
 *
 * Run by hand, not in CI: it needs the full Chromium (`pnpm exec playwright install chromium`;
 * the headless shell opts out of the cache), and the default targets are the live site. Phase 15.12 found
 * the site eligible with a real presence socket open and the Turnstile iframe loaded, because the
 * presence client closes its socket when the tab is hidden (modules/edge.js), which is before the
 * page is frozen. This is the check to run if that ever stops being true.
 *
 * Usage: pnpm check:bfcache [url ...]   (exit 1 if any page is not restored)
 */

import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

export const DEFAULT_URLS = [
  'https://andernet.dev/',
  'https://andernet.dev/posts/making-a-portfolio-agent-ready/',
  'https://andernet.dev/status/',
];

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {string} url
 * @param {(page: import('@playwright/test').Page) => Promise<void>} [prepare] - run once the page has settled (a test uses it to break the page on purpose)
 * @returns {Promise<{ url: string, restored: boolean, reasons: string[] }>}
 */
export async function checkPage(browser, url, prepare) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const session = await context.newCDPSession(page);
  await session.send('Page.enable');
  const reasons = [];
  session.on('Page.backForwardCacheNotUsed', event => {
    for (const item of event.notRestoredExplanations) {
      reasons.push(`${item.type}:${item.reason}`);
    }
  });
  // The same page answering has the same token; a reload does not
  await page.addInitScript(() => {
    globalThis.__bfcacheToken = Math.random();
  });
  // Nothing is written to the site: no POSTs to its API
  await page.route('**/api/**', route =>
    route.request().method() === 'POST' ? route.abort() : route.continue()
  );
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(5000); // past the idle callbacks, so the presence socket is open
  await prepare?.(page);
  const before = await page.evaluate(() => globalThis.__bfcacheToken);
  await page.goto('about:blank');
  // Playwright's own goBack() waits for a load event that a cache restore never fires
  // (the page may be gone before evaluate can answer, so any answer or error is ignored)
  await page.evaluate(() => globalThis.history.back()).catch(() => {});
  // Polled: a cache restore fires no load event, which is what waitForURL would wait for
  for (let waited = 0; page.url().startsWith('about:'); waited += 250) {
    if (waited >= 15_000) throw new Error(`Back did not leave about:blank for ${url}`);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => globalThis.__bfcacheToken);
  await context.close();
  return { url, restored: before === after, reasons };
}

async function main() {
  const urls = process.argv.slice(2);
  const targets = urls.length ? urls : DEFAULT_URLS;
  // Not the headless shell: it opts out of the cache (BackForwardCacheDisabledForDelegate)
  const browser = await chromium.launch({
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
  });
  let failed = 0;
  try {
    for (const url of targets) {
      const result = await checkPage(browser, url);
      const note = result.restored ? '' : `  because: ${result.reasons.join(', ') || 'unknown'}`;
      console.log(`${result.restored ? 'restored  ' : 'NOT RESTORED'} ${url}${note}`);
      if (!result.restored) failed++;
    }
  } finally {
    await browser.close();
  }
  process.exitCode = failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(`check-bfcache: ${error.message}`);
    process.exitCode = 1;
  });
}
