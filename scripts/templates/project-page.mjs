/**
 * A project's own page: /projects/<slug>/index.html, pre-rendered by scripts/generate-site.mjs
 * from projects-data.json. It replaces the old case-study modal: the same write-up, but at a
 * URL that can be shared, bookmarked and indexed, with its own share card.
 *
 * Only what is in the curated data appears. There are no live numbers, and "metrics" show only
 * when the data has them.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';
import {
  AUTHOR,
  PAGE_SCRIPTS,
  SITE,
  renderFooter,
  renderHead,
  renderNav,
  renderPagerLink,
} from './chrome.mjs';
import { renderMedia } from './projects.mjs';

/**
 * The share card: the project's own screenshot crop if one was captured, otherwise the site's.
 * @param {{ screenshot: { name: string } | null }} view
 * @param {(path: string) => boolean} exists - whether a file exists under the site root
 * @returns {string} an absolute URL
 */
export function shareImage(view, exists) {
  const own = view.screenshot ? `/images/projects/${view.screenshot.name}-og.jpg` : null;
  return own && exists(own) ? `${SITE}${own}` : `${SITE}/og/default.png`;
}

/** A project as one side of the pager. */
const pagerLink = (view, label) => view && { href: view.pageUrl, title: view.displayName, label };

/**
 * @param {object} args
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} args.view
 * @param {object | null} args.prev - the previous project's view, if any
 * @param {object | null} args.next - the next project's view, if any
 * @param {string} args.image - the absolute URL of the share card
 * @returns {string} a complete HTML document
 */
export function renderProjectPage({ view, prev, next, image }) {
  const path = view.pageUrl;
  const url = `${SITE}${path}`;
  const title = `${view.displayName} | ${AUTHOR}`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: view.displayName,
      description: view.description,
      url,
      image,
      codeRepository: view.htmlUrl,
      programmingLanguage: view.language,
      keywords: view.technologies.join(', '),
      author: { '@type': 'Person', name: AUTHOR, url: SITE, '@id': `${SITE}/#person` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Projects', item: `${SITE}/#projects` },
        { '@type': 'ListItem', position: 3, name: view.displayName, item: url },
      ],
    },
  ];

  const demo = view.homepage
    ? `<a class="button button--primary" href="${esc(view.homepage)}" target="_blank" rel="noopener noreferrer">Live demo ${icon('external-link-alt')}</a>`
    : '';
  const source = `<a class="button${view.homepage ? '' : ' button--primary'}" href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">${icon('github')} Source on GitHub</a>`;

  const metrics = view.metrics.length
    ? `
          <section aria-labelledby="metrics-heading">
            <h2 id="metrics-heading">By the numbers</h2>
            <dl class="metrics">
              ${view.metrics
                .map(
                  metric => `<div class="metric">
                <dt class="metric__label">${esc(metric.label)}</dt>
                <dd class="metric__value">${esc(metric.value)}</dd>
              </div>`
                )
                .join('\n              ')}
            </dl>
          </section>`
    : '';

  const highlights = view.highlights.length
    ? `
          <section aria-labelledby="highlights-heading">
            <h2 id="highlights-heading">Highlights</h2>
            <ul class="highlights">
              ${view.highlights.map(text => `<li>${esc(text)}</li>`).join('\n              ')}
            </ul>
          </section>`
    : '';

  const facts = [
    view.category && ['Category', esc(view.category)],
    view.status && ['Status', esc(view.status)],
    ['Language', esc(view.language)],
  ]
    .filter(Boolean)
    .map(([label, value]) => `<div class="facts__row"><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('\n              ');

  const stack = view.technologies.length
    ? `
            <h2 class="eyebrow">Stack</h2>
            <ul class="tag-list">${view.technologies.map(tag => `<li class="tag">${esc(tag)}</li>`).join('')}</ul>`
    : '';

  return `<!doctype html>
<html lang="en">
  ${renderHead({
    title,
    description: view.description,
    path,
    image,
    type: 'article',
    structuredData,
  })}
  <body>
    <a href="#main" class="skip-link">Skip to main content</a>
    ${renderNav({ backHref: '/#projects', backLabel: 'All projects' })}
    <main id="main" class="article">
      <div class="wrap">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/#projects">Projects</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">${esc(view.displayName)}</span>
        </nav>

        <header class="project-head">
          ${view.category ? `<p class="eyebrow">${esc(view.category)}</p>` : ''}
          <h1 class="project-head__title" data-vt="title">${esc(view.displayName)}</h1>
          <p class="project-head__lede">${esc(view.description)}</p>
          <div class="project-head__actions">
            ${demo}
            ${source}
          </div>
        </header>

        <div class="project-hero" data-vt="media">
          ${renderMedia(view, 'hero', true)}
        </div>

        <div class="project-body">
          <article class="project-body__main">
            ${
              view.longDescription
                ? `<section aria-labelledby="overview-heading">
              <h2 id="overview-heading">Overview</h2>
              <p class="project-body__overview">${esc(view.longDescription)}</p>
            </section>`
                : ''
            }${metrics}${highlights}
          </article>
          <aside class="project-body__aside" aria-label="Project facts">
            <dl class="facts">
              ${facts}
            </dl>${stack}
          </aside>
        </div>

        <nav class="pager" aria-label="More projects">
          ${renderPagerLink(pagerLink(prev, 'Previous project'), 'prev')}
          ${renderPagerLink(pagerLink(next, 'Next project'), 'next')}
        </nav>
      </div>
    </main>
    ${renderFooter()}
    ${PAGE_SCRIPTS}
  </body>
</html>
`;
}
