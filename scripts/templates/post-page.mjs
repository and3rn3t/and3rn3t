/**
 * A post's own page: /posts/<slug>/index.html, pre-rendered by scripts/generate-site.mjs from
 * posts-data.json. The body is the post's HTML, written by hand in the data file, so it is
 * trusted markup; everything else is escaped.
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
import { longDate, minutes } from './shared.mjs';

/** @param {{ slug: string }} post */
export const postPath = post => `/posts/${post.slug}/`;

/** A post as one side of the pager: the newer one is "previous", the older one "next". */
const pagerLink = (post, label) => post && { href: postPath(post), title: post.title, label };

/**
 * @param {object} args
 * @param {{ slug: string, title: string, summary: string, date: string, tags?: string[], content: string }} args.post
 * @param {object | undefined} args.newer - the next newer post, if any
 * @param {object | undefined} args.older - the next older post, if any
 * @returns {string} a complete HTML document
 */
export function renderPostPage({ post, newer, older }) {
  const path = postPath(post);
  const url = `${SITE}${path}`;
  const title = `${post.title} | ${AUTHOR}`;
  const image = `${SITE}/og/default.png`;
  const tags = post.tags ?? [];

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.summary,
      datePublished: post.date,
      dateModified: post.date,
      url,
      mainEntityOfPage: url,
      image,
      keywords: tags.join(', '),
      inLanguage: 'en-US',
      // The same @id as the Person on the home page, so the two read as one entity
      author: { '@type': 'Person', name: AUTHOR, url: SITE, '@id': `${SITE}/#person` },
      publisher: { '@id': `${SITE}/#person` },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Writing', item: `${SITE}/#writing` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ];

  const extraMeta = [
    `    <meta property="article:published_time" content="${post.date}" />`,
    `    <meta property="article:author" content="${AUTHOR}" />`,
    ...tags.map(tag => `    <meta property="article:tag" content="${esc(tag)}" />`),
  ].join('\n');

  return `<!doctype html>
<html lang="en">
  ${renderHead({
    title,
    description: post.summary,
    path,
    image,
    type: 'article',
    structuredData,
    extraMeta,
  })}
  <body>
    <div class="reading-progress" aria-hidden="true"></div>
    <a href="#main" class="skip-link">Skip to main content</a>
    ${renderNav({ backHref: '/#writing', backLabel: 'All posts' })}
    <main id="main" class="article">
      <div class="wrap">
        <nav class="breadcrumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <a href="/#writing">Writing</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">${esc(post.title)}</span>
        </nav>

        <article class="post">
          <header class="post-head">
            <p class="eyebrow">
              <time datetime="${post.date}">${longDate(post.date)}</time>
              <span aria-hidden="true">&middot;</span>
              <span class="post-head__reading">${icon('clock')} ${minutes(post)} min read</span>
            </p>
            <h1 class="post-head__title">${esc(post.title)}</h1>${
              tags.length
                ? `
            <ul class="tag-list" aria-label="Tags">${tags.map(tag => `<li class="tag">${esc(tag)}</li>`).join('')}</ul>`
                : ''
            }
          </header>
          <div class="prose">${post.content}</div>
        </article>${
          newer || older
            ? `

        <nav class="pager" aria-label="More posts">
          ${renderPagerLink(pagerLink(newer, 'Newer post'), 'prev')}
          ${renderPagerLink(pagerLink(older, 'Older post'), 'next')}
        </nav>`
            : ''
        }
      </div>
    </main>
    ${renderFooter()}
    ${PAGE_SCRIPTS}
  </body>
</html>
`;
}
