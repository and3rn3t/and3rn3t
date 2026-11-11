/**
 * The Writing section's rows for index.html, pre-rendered by scripts/generate-site.mjs from
 * posts-data.json. One row per post: date, title and summary, reading time.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { minutes, shortDate } from './shared.mjs';

/**
 * @param {object[]} posts - newest first
 * @returns {string}
 */
export function renderPostRows(posts) {
  return posts
    .map(
      post => `<article class="post-row" data-slug="${esc(post.slug)}">
          <time class="post-row__date" datetime="${esc(post.date)}">${shortDate(post.date)}</time>
          <div class="post-row__main">
            <h3 class="post-row__title"><a href="/posts/${encodeURIComponent(post.slug)}/">${esc(post.title)}</a></h3>
            <p class="post-row__summary">${esc(post.summary)}</p>
          </div>
          <p class="post-row__time">${minutes(post)} min read</p>
        </article>`
    )
    .join('\n        ');
}
