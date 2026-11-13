/**
 * The parts every generated page shares: the <head>, the navigation bar and the footer.
 * Used by the project pages, the post pages and the 404 page.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';

export const SITE = 'https://andernet.dev';
export const AUTHOR = 'Matthew Anderson';
export const CF_BEACON_TOKEN = '883fb1c6a2c744d4b745475d92f474bf';

/** JSON for an inline <script>: keep "<" from ever closing the tag. */
export const jsonLd = data => JSON.stringify(data, null, 2).replaceAll('<', '\\u003c');

/**
 * The theme, before first paint: sets <html data-theme>, which styles/core.css resolves with
 * light-dark(). The same script as index.html's.
 */
const THEME_SCRIPT = `(function () {
        var theme = null;
        try {
          theme = localStorage.getItem('theme');
        } catch (e) {}
        var dark =
          theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      })();`;

/**
 * Cross-document view transitions: opt in, and switch the animation off for reduced motion.
 *
 * This must be INLINE in every page's <head>, not in a stylesheet: Chrome reads the opt-in when
 * the page is revealed, and with an external stylesheet it sometimes does that before the sheet
 * is applied and aborts the transition ("opt-in disabled", an unhandled rejection in the
 * console). Measured: the rule in styles/core.css aborted 8 of 15 card-to-page navigations;
 * inline, 0 of 15. Both pages of a navigation must opt in, so index.html carries an identical
 * copy (a unit test keeps them the same) and so do the post pages.
 */
export const VIEW_TRANSITION_CSS =
  '@view-transition { navigation: auto; } @media (prefers-reduced-motion: reduce) { ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; } }';

/**
 * @param {object} page
 * @param {string} page.title - the full <title>
 * @param {string} page.description
 * @param {string | null} page.path - the page's path on the site, e.g. "/projects/health/"; null for none
 * @param {string} [page.image] - an absolute URL for the share card
 * @param {'website' | 'article'} [page.type]
 * @param {object[]} [page.structuredData] - JSON-LD objects
 * @param {string} [page.robots] - the robots meta content
 * @param {string} [page.extraMeta] - more <meta> tags (an article's date, author and tags)
 * @param {string[]} [page.stylesheets] - more stylesheets, loaded after article.css
 * @returns {string} a complete <head> element
 */
export function renderHead({
  title,
  description,
  path,
  image = `${SITE}/og/default.png`,
  type = 'website',
  structuredData = [],
  robots = 'index, follow, max-image-preview:large',
  extraMeta = '',
  stylesheets = [],
}) {
  // A page with no address of its own (the 404 page) has no canonical or og:url
  const url = path ? `${SITE}${path}` : null;
  return `<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <style>
      @layer scale, reset, tokens, base, components, sections, utilities;
      ${VIEW_TRANSITION_CSS}
    </style>
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="author" content="${AUTHOR}" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbfbf8" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0d0b" />
    <meta name="robots" content="${robots}" />
${url ? `    <link rel="canonical" href="${url}" />\n` : ''}    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="alternate" type="application/rss+xml" title="${AUTHOR}'s Blog" href="/feed.xml" />

    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="Matthew Anderson Portfolio" />
${url ? `    <meta property="og:url" content="${url}" />\n` : ''}    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${image}" />
${extraMeta ? `${extraMeta}\n` : ''}
    <script>
      ${THEME_SCRIPT}
    </script>
    <!-- Names a project's image and title for the transition between its card and its page.
         A classic script in the head: it must listen before the page first renders. -->
    <script src="/modules/page-transitions.js"></script>
    <link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin />
    <link
      rel="preload"
      href="/fonts/jetbrains-mono-500.woff2"
      as="font"
      type="font/woff2"
      crossorigin
    />
    <link rel="stylesheet" href="/styles/core.css" />
    <link rel="stylesheet" href="/styles/article.css" />${stylesheets
      .map(href => `\n    <link rel="stylesheet" href="${href}" />`)
      .join('')}
${structuredData
  .map(
    data => `    <script type="application/ld+json">
${jsonLd(data)}
    </script>`
  )
  .join('\n')}
  </head>`;
}

/**
 * The bar across the top of a generated page: home, a way back, and the theme toggle.
 * @param {{ backHref: string, backLabel: string }} back
 * @returns {string}
 */
export function renderNav({ backHref, backLabel }) {
  return `<nav class="site-nav scrolled" aria-label="Main navigation">
      <div class="wrap site-nav__inner">
        <a href="/" class="site-nav__logo">@and3rn3t</a>
        <div class="site-nav__actions">
          <a class="link site-nav__back" href="${esc(backHref)}">${esc(backLabel)}</a>
          <button
            type="button"
            class="icon-button"
            id="theme-toggle"
            aria-label="Switch to dark theme"
            title="Switch to dark theme (T)"
          >
            ${icon('moon')}
          </button>
        </div>
      </div>
    </nav>`;
}

/**
 * One side of a previous/next pager, or an empty cell that keeps the other side in its column.
 * @param {{ href: string, title: string, label: string } | null} link
 * @param {'prev' | 'next'} direction
 * @returns {string}
 */
export function renderPagerLink(link, direction) {
  if (!link) return '<span></span>';
  return `<a class="pager__link pager__link--${direction}" href="${esc(link.href)}" rel="${direction}">
            <span class="eyebrow">${esc(link.label)}</span>
            <span class="pager__title">${esc(link.title)}</span>
          </a>`;
}

/** @returns {string} */
export function renderFooter() {
  return `<footer class="site-footer">
      <div class="wrap site-footer__inner">
        <p class="site-footer__note">${AUTHOR} &middot; <a class="link" href="/">andernet.dev</a></p>
        <ul class="site-footer__links">
          <li>
            <span class="site-footer__views" data-edge-widget hidden>
              <a class="link" href="/status/" data-edge-receipt></a>
              <span data-presence hidden></span>
            </span>
          </li>
          <li><a class="link" href="/status/">Status</a></li>
          <li><a class="link" href="/#projects">All projects</a></li>
          <li>
            <a class="link" href="https://github.com/and3rn3t/and3rn3t" target="_blank" rel="noopener noreferrer">Source</a>
          </li>
          <li><a class="link" href="/feed.xml">RSS</a></li>
        </ul>
      </div>
    </footer>`;
}

/** Everything a generated page needs to run: the theme toggle, and the analytics beacon. */
export const PAGE_SCRIPTS = `<script type="module" src="/modules/post-page.js"></script>
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon='{"token": "${CF_BEACON_TOKEN}"}'
    ></script>`;
