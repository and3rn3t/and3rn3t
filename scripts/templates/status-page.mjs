/**
 * The status page, /status/: how the site and its API are doing, from the numbers the Worker
 * publishes at /api/stats. This file renders the page's structure and wording; modules/status-page.js
 * fills in the numbers in the browser (the figures change every few minutes, and a page that
 * changed that often would be rewritten in the repository all day).
 *
 * Aggregates only: how the site performs, never who visits it.
 */

import { PAGE_SCRIPTS, renderFooter, renderHead, renderNav } from './chrome.mjs';

const NOTE_UPTIME =
  'A check every five minutes asks for the home page the way a visitor would, from Cloudflare’s network.';

/** @returns {string} a complete HTML document */
export function renderStatusPage() {
  return `<!doctype html>
<html lang="en">
  ${renderHead({
    title: 'Status | Matthew Anderson',
    description:
      'Live numbers for andernet.dev: uptime, API speed and errors, how fast it feels to real visitors, and how much of the traffic is crawlers and AI agents.',
    path: '/status/',
    stylesheets: ['/styles/status.css'],
  })}
  <body>
    <a href="#main" class="skip-link">Skip to main content</a>
    ${renderNav({ backHref: '/', backLabel: 'Home' })}
    <main id="main" class="article status" data-status-root>
      <div class="wrap">
        <header class="status-head">
          <p class="eyebrow">Status</p>
          <h1 class="status-title">How andernet.dev is doing</h1>
          <p class="status-lede">
            Live numbers from Cloudflare’s edge, the same ones the site’s API and MCP server report.
            Everything here is an aggregate: it measures how the site performs, not who visits it.
          </p>
        </header>

        <div class="status-verdict" data-state="loading" role="status" data-verdict>
          <p class="status-verdict__label" data-verdict-label>Checking…</p>
          <p class="status-verdict__detail" data-verdict-detail></p>
        </div>

        <noscript>
          <p class="status-note">
            The numbers on this page load with JavaScript. The same data is at
            <a class="link" href="/api/stats">/api/stats</a> as JSON.
          </p>
        </noscript>

        <section class="status-section" aria-labelledby="uptime-title">
          <h2 class="status-section__title" id="uptime-title">Uptime</h2>
          <p class="status-note">${NOTE_UPTIME}</p>
          <div
            class="uptime"
            data-uptime
            tabindex="0"
            role="group"
            aria-label="Uptime by day, oldest on the left. Use the left and right arrow keys to read each day."
          ></div>
          <p class="uptime__readout" data-uptime-readout aria-live="polite">&nbsp;</p>
          <ul class="legend" aria-label="Key">
            <li class="legend__item legend__item--ok">Every check passed</li>
            <li class="legend__item legend__item--partial">Some checks failed</li>
            <li class="legend__item legend__item--down">Every check failed</li>
            <li class="legend__item legend__item--none">No data</li>
          </ul>
          <details class="status-table">
            <summary>View as a table</summary>
            <div data-table="uptime"></div>
          </details>
        </section>

        <section class="status-section" aria-labelledby="api-title">
          <h2 class="status-section__title" id="api-title">The API</h2>
          <p class="status-note">
            The small API behind the site: the view counter, the guestbook, recent activity and this
            page. Times are how long the Worker took to answer.
          </p>
          <dl class="stat-grid">
            <div class="stat">
              <dt>Errors, last 24 hours</dt>
              <dd class="stat__value" data-stat="error-24h">—</dd>
              <dd class="stat__sub" data-stat="error-7d">&nbsp;</dd>
            </div>
            <div class="stat">
              <dt>Typical answer, last 24 hours</dt>
              <dd class="stat__value" data-stat="p50-24h">—</dd>
              <dd class="stat__sub" data-stat="p50-7d">&nbsp;</dd>
            </div>
            <div class="stat">
              <dt>Slowest 5%, last 24 hours</dt>
              <dd class="stat__value" data-stat="p95-24h">—</dd>
              <dd class="stat__sub" data-stat="p95-7d">&nbsp;</dd>
            </div>
          </dl>
          <p class="status-note status-note--after">
            The slow end includes the occasional call that has to wait for GitHub.
          </p>
        </section>

        <section class="status-section" aria-labelledby="visitors-title">
          <h2 class="status-section__title" id="visitors-title">How it feels to visitors</h2>
          <p class="status-note">
            Measured in real visitors’ browsers over the last 7 days, at the 75th percentile (three
            in four visits were at least this fast). A figure appears once enough visits have
            measured it, and is a dash when the data cannot be read; bots are left out.
          </p>
          <ul class="meter-list" data-vitals></ul>
        </section>

        <section class="status-section" aria-labelledby="edge-title">
          <h2 class="status-section__title" id="edge-title">Served from the edge</h2>
          <p class="status-note">
            The site is hosted on GitHub Pages. Cloudflare keeps a copy of each page for up to an
            hour, so most requests never reach it.
          </p>
          <ul class="meter-list" data-edge></ul>
        </section>

        <section class="status-section" aria-labelledby="agents-title">
          <h2 class="status-section__title" id="agents-title">Crawlers and AI agents</h2>
          <p class="status-note">
            This site is built to be read by machines too: it has an <a class="link" href="/llms.txt">llms.txt</a>,
            serves any page as Markdown, and runs an <a class="link" href="/.well-known/mcp/server-card.json">MCP server</a>.
            Counts are requests in the last 7 days from crawlers Cloudflare can verify, by what they are.
          </p>
          <dl class="stat-grid stat-grid--single">
            <div class="stat">
              <dt>API calls made by agents</dt>
              <dd class="stat__value" data-stat="agent-share">—</dd>
              <dd class="stat__sub">the rest come from browsers</dd>
            </div>
          </dl>
          <h3 class="status-subtitle">Verified crawlers</h3>
          <ol class="rank" data-rank="crawlers"></ol>
          <h3 class="status-subtitle">MCP tools used</h3>
          <ol class="rank" data-rank="tools"></ol>
        </section>

        <section class="status-section status-prose" aria-labelledby="how-title">
          <h2 class="status-section__title" id="how-title">How this page works</h2>
          <p>
            A Cloudflare Worker writes one data point for every API request and every MCP tool call
            (a fixed route name, a status and a time: no address, no user agent), and a scheduled
            check of the home page every five minutes. This page reads them back through the
            Analytics SQL binding, together with Cloudflare’s own request and Web Vitals data for this
            site, and caches the answer for five minutes.
          </p>
          <p>
            Nothing here says how many people visit or where they are. The same numbers are
            <a class="link" href="/api/stats">available as JSON</a>, and to AI agents as the
            <code>get_site_stats</code> tool on the MCP server. The code is in the
            <a class="link" href="https://github.com/and3rn3t/and3rn3t/tree/main/worker" target="_blank" rel="noopener noreferrer">site’s repository</a>.
          </p>
          <p class="status-updated" data-updated>&nbsp;</p>
        </section>
      </div>
    </main>
    ${renderFooter()}
    ${PAGE_SCRIPTS}
    <script type="module" src="/modules/status-page.js"></script>
  </body>
</html>
`;
}
