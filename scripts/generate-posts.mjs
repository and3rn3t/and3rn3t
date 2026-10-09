/**
 * Generate static post pages from posts-data.json.
 *
 *   posts/<slug>/index.html  — one indexable page per post (own title, description,
 *                              canonical, Open Graph, BlogPosting JSON-LD)
 *   feed.xml                 — RSS feed (links and ids point at the post pages)
 *   sitemap.xml              — the "Blog Posts" block is rewritten; the rest is left alone
 *
 * Production serves raw source from GitHub Pages, so the output is committed. CI runs
 * this script and fails if it produces a diff (see quality.yml).
 *
 * Usage: pnpm generate:posts
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../modules/utils/html.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://andernet.dev';
const AUTHOR = 'Matthew Anderson';
const READING_SPEED_WPM = 200;
const CF_BEACON_TOKEN = '883fb1c6a2c744d4b745475d92f474bf';

const { posts } = JSON.parse(readFileSync(join(ROOT, 'posts-data.json'), 'utf8'));
// Newest first, whatever order the data file is in
posts.sort((a, b) => b.date.localeCompare(a.date));

const esc = escapeHtml;

const postUrl = post => `${SITE}/posts/${post.slug}/`;
const postPath = post => `/posts/${post.slug}/`;

const minutes = post =>
  post.readingMinutes ??
  Math.max(
    1,
    Math.round(
      post.content
        .replace(/<[^>]*>/g, ' ')
        .trim()
        .split(/\s+/).length / READING_SPEED_WPM
    )
  );

const longDate = dateStr => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

const rfc822 = dateStr => new Date(`${dateStr}T00:00:00Z`).toUTCString().replace('GMT', '+0000');

const icon = name =>
  `<svg class="icon" aria-hidden="true" focusable="false"><use href="/icons/sprite.svg#${name}"></use></svg>`;

// JSON for an inline <script>: keep "<" from ever closing the tag
const jsonLd = data => JSON.stringify(data, null, 2).replaceAll('<', '\\u003c');

function pagerLink(post, direction) {
  if (!post) return '';
  const label = direction === 'prev' ? 'Newer post' : 'Older post';
  return `<a class="post-pager-link post-pager-${direction}" href="${postPath(post)}" rel="${direction === 'prev' ? 'prev' : 'next'}">
            <span class="post-pager-label">${label}</span>
            <span class="post-pager-title">${esc(post.title)}</span>
          </a>`;
}

function renderPost(post, index) {
  const url = postUrl(post);
  const newer = posts[index - 1];
  const older = posts[index + 1];
  const title = `${post.title} | ${AUTHOR}`;
  const image = `${SITE}/og/default.png`;
  const tags = (post.tags ?? []).map(t => `<span class="blog-tag">${esc(t)}</span>`).join('');

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    dateModified: post.date,
    url,
    mainEntityOfPage: url,
    image,
    keywords: (post.tags ?? []).join(', '),
    inLanguage: 'en-US',
    author: { '@type': 'Person', name: AUTHOR, url: SITE },
    publisher: { '@id': `${SITE}/#person` },
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(post.summary)}" />
    <meta name="author" content="${AUTHOR}" />
    <meta name="theme-color" content="#16a34a" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <link rel="canonical" href="${url}" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="alternate" type="application/rss+xml" title="${AUTHOR}'s Blog" href="/feed.xml" />

    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Matthew Anderson Portfolio" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(post.title)}" />
    <meta property="og:description" content="${esc(post.summary)}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="article:published_time" content="${post.date}" />
    <meta property="article:author" content="${AUTHOR}" />
${(post.tags ?? []).map(t => `    <meta property="article:tag" content="${esc(t)}" />`).join('\n')}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(post.title)}" />
    <meta name="twitter:description" content="${esc(post.summary)}" />
    <meta name="twitter:image" content="${image}" />

    <link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/styles.css" />

    <script type="application/ld+json">
${jsonLd(structuredData)}
    </script>
  </head>
  <body>
    <script>
      // Apply the saved/system theme before first paint so dark visitors never see a white flash.
      (function () {
        var t = null;
        try {
          t = localStorage.getItem('theme');
        } catch (e) {}
        if (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.body.classList.add('dark-theme');
        }
      })();
    </script>
    <a href="#main" class="skip-link">Skip to main content</a>

    <header class="post-nav">
      <div class="post-nav-inner">
        <a href="/" class="nav-logo">@and3rn3t</a>
        <div class="post-nav-actions">
          <a href="/#writing" class="post-nav-link">All posts</a>
          <button
            type="button"
            class="theme-toggle"
            id="theme-toggle"
            aria-label="Switch to dark theme"
            title="Switch to dark theme (T)"
          >
            ${icon('moon')}
          </button>
        </div>
      </div>
    </header>

    <main id="main" class="post-page">
      <div class="container">
        <div class="blog-article-inner">
          <a href="/#writing" class="blog-back-link">${icon('arrow-left')} Back to writing</a>
          <article class="blog-article-body">
            <header class="blog-article-header">
              <div class="blog-card-meta">
                <time datetime="${post.date}">${longDate(post.date)}</time>
                <span class="blog-reading-time">${icon('clock')} ${minutes(post)} min read</span>
              </div>
              <h1 class="blog-article-title">${esc(post.title)}</h1>
              <div class="blog-card-tags">${tags}</div>
            </header>
            <div class="blog-article-content">${post.content}</div>
          </article>
${
  newer || older
    ? `          <nav class="post-pager" aria-label="More posts">
          ${pagerLink(newer, 'prev')}
          ${pagerLink(older, 'next')}
          </nav>
`
    : ''
}        </div>
      </div>
    </main>

    <footer class="footer">
      <div class="container footer-inner">
        <p>${AUTHOR} · <a href="/">andernet.dev</a></p>
      </div>
    </footer>

    <script type="module" src="/modules/post-page.js"></script>
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon='{"token": "${CF_BEACON_TOKEN}"}'
    ></script>
  </body>
</html>
`;
}

// ── posts/<slug>/index.html ──────────────────────────────────────────────────
rmSync(join(ROOT, 'posts'), { recursive: true, force: true });
posts.forEach((post, index) => {
  const dir = join(ROOT, 'posts', post.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderPost(post, index));
  console.log(`  wrote posts/${post.slug}/index.html`);
});

// ── feed.xml ─────────────────────────────────────────────────────────────────
const feedItems = posts
  .map(
    post => `    <item>
      <title>${esc(post.title)}</title>
      <link>${postUrl(post)}</link>
      <guid isPermaLink="false">${SITE}/posts/${post.slug}</guid>
      <pubDate>${rfc822(post.date)}</pubDate>
      <description>${esc(post.summary)}</description>
${(post.tags ?? []).map(t => `      <category>${esc(t)}</category>`).join('\n')}
      <content:encoded><![CDATA[
        ${post.content.replaceAll(']]>', ']]]]><![CDATA[>')}
      ]]></content:encoded>
    </item>
`
  )
  .join('\n');

writeFileSync(
  join(ROOT, 'feed.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${AUTHOR} — Writing</title>
    <link>${SITE}/#writing</link>
    <description>Technical posts on health tech, IoT, data engineering, and whatever else captures my attention.</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(posts[0].date)}</lastBuildDate>
    <managingEditor>and3rn3t@icloud.com (${AUTHOR})</managingEditor>
    <webMaster>and3rn3t@icloud.com (${AUTHOR})</webMaster>
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE}/icons/icon-192.png</url>
      <title>${AUTHOR}</title>
      <link>${SITE}</link>
    </image>

${feedItems}  </channel>
</rss>
`
);
console.log('  wrote feed.xml');

// ── sitemap.xml (only the "Blog Posts" block) ───────────────────────────────
const sitemapPath = join(ROOT, 'sitemap.xml');
const sitemap = readFileSync(sitemapPath, 'utf8');
const start = '  <!-- Blog Posts -->\n';
const end = '  <!-- Offline Page (for PWA) -->';
const from = sitemap.indexOf(start);
const to = sitemap.indexOf(end);
if (from === -1 || to === -1 || to < from) {
  throw new Error('sitemap.xml is missing the "Blog Posts" / "Offline Page" markers');
}
const urls = posts
  .map(
    post => `  <url>
    <loc>${postUrl(post)}</loc>
    <lastmod>${post.date}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`
  )
  .join('\n');
writeFileSync(sitemapPath, `${sitemap.slice(0, from)}${start}${urls}\n${sitemap.slice(to)}`);
console.log('  wrote sitemap.xml');
