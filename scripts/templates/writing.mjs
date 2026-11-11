/**
 * The Writing section's post cards for index.html, pre-rendered by scripts/generate-site.mjs
 * from posts-data.json.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';
import { longDate, minutes } from './shared.mjs';

/**
 * @param {object[]} posts - newest first
 * @returns {string}
 */
export function renderBlogCards(posts) {
  return posts
    .map(
      post => `<article class="blog-card" data-slug="${esc(post.slug)}">
          <div class="blog-card-meta">
            <time datetime="${esc(post.date)}" class="blog-date">${longDate(post.date)}</time>
            <span class="blog-reading-time">${icon('clock')} ${minutes(post)} min read</span>
          </div>
          <h3 class="blog-card-title">${esc(post.title)}</h3>
          <p class="blog-card-summary">${esc(post.summary)}</p>
          <div class="blog-card-tags">${(post.tags ?? []).map(tag => `<span class="blog-tag">${esc(tag)}</span>`).join('')}</div>
          <a href="/posts/${encodeURIComponent(post.slug)}/" class="blog-read-more" aria-label="Read ${esc(post.title)}">Read post ${icon('arrow-right')}</a>
        </article>`
    )
    .join('\n        ');
}
