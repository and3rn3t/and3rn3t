/**
 * Generate the site's pre-rendered content from its data files.
 *
 *   index.html               - the project cards, jobs, education, facts and post rows
 *                              are written between <!-- gen:NAME --> markers, so the page
 *                              reads fine before (or without) JavaScript
 *   projects/<slug>/index.html - one page per curated project: its write-up, at a URL that
 *                              can be shared and indexed (replaces the case-study modal)
 *   posts/<slug>/index.html  - one indexable page per post (own title, description,
 *                              canonical, Open Graph, BlogPosting JSON-LD)
 *   feed.xml                 - RSS feed (links and ids point at the post pages)
 *   sitemap.xml              - the "Blog Posts" block is rewritten; the rest is left alone
 *
 * Inputs: projects-data.json, experience-data.json, posts-data.json and, for which repos are
 * starred, github-data.json. Live numbers (stars, last push, stats) are NOT baked in: the
 * service worker's build id hashes every *.html file, so a page that changed daily would
 * evict every visitor's cache daily. The browser fills those in (modules/projects.js).
 *
 * Production serves raw source from GitHub Pages, so the output is committed. CI runs this
 * script and fails if it produces a diff (see quality.yml); the daily data workflow runs it
 * too, because a newly starred repo changes the project list.
 *
 * Usage: pnpm generate:site
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../modules/utils/html.js';
import { icon } from '../modules/utils/icon.js';
import { projectView, selectProjects } from '../modules/utils/projects.js';
import { renderEducation, renderFacts, renderJobs } from './templates/experience.mjs';
import { AUTHOR, CF_BEACON_TOKEN, SITE, VIEW_TRANSITION_CSS } from './templates/chrome.mjs';
import { renderCover } from './templates/cover.mjs';
import { renderProjectPage, shareImage } from './templates/project-page.mjs';
import { coverFiles, renderProjects, splitProjects } from './templates/projects.mjs';
import { longDate, minutes } from './templates/shared.mjs';
import { renderPostRows } from './templates/writing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { posts } = JSON.parse(readFileSync(join(ROOT, 'posts-data.json'), 'utf8'));
// Newest first, whatever order the data file is in
posts.sort((a, b) => b.date.localeCompare(a.date));

const esc = escapeHtml;

const postUrl = post => `${SITE}/posts/${post.slug}/`;
const postPath = post => `/posts/${post.slug}/`;

const rfc822 = dateStr => new Date(`${dateStr}T00:00:00Z`).toUTCString().replace('GMT', '+0000');

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
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
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
    <!-- Opts in to view transitions; see VIEW_TRANSITION_CSS. Moves to core.css in Phase 10.5. -->
    <style>${VIEW_TRANSITION_CSS}</style>

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

// ── index.html (pre-rendered sections) ───────────────────────────────────────
const readJson = file => JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

/**
 * Replace what sits between `<!-- gen:NAME -->` and `<!-- /gen:NAME -->`, keeping the markers
 * (and their indentation) so the next run finds them again.
 */
function fillBlock(html, name, content) {
  const open = `<!-- gen:${name} -->`;
  const close = `<!-- /gen:${name} -->`;
  const from = html.indexOf(open);
  const to = html.indexOf(close);
  if (from === -1 || to === -1 || to < from) {
    throw new Error(`index.html is missing the ${open} / ${close} markers`);
  }
  const indent = html.slice(html.lastIndexOf('\n', from) + 1, from);
  return `${html.slice(0, from)}${open}\n${indent}${content}\n${indent}${close}${html.slice(to + close.length)}`;
}

const projectsData = readJson('projects-data.json');
const experienceData = readJson('experience-data.json');
const githubData = readJson('github-data.json');

const views = selectProjects(
  projectsData,
  githubData.repositories,
  githubData.selfStarredRepoNames
).map(({ repo, metadata }) => projectView(repo, metadata));
const { lead, cards, more, counts } = renderProjects(views);

// ── projects/<slug>/index.html (every curated project with a write-up) ───────────────────────
// The projects on the home page come first, in their order, then the rest of the curated file,
// so the previous/next links follow what a visitor has just seen.
const repoByName = new Map(githubData.repositories.map(repo => [repo.name, repo]));
const shown = new Set(views.map(view => view.name));
const others = projectsData.projects
  .filter(metadata => !shown.has(metadata.name))
  .map(metadata =>
    projectView(
      repoByName.get(metadata.name) ??
        repoByName.get(metadata.github_repo?.split('/').pop()) ??
        null,
      metadata
    )
  );
const pageViews = [...views, ...others].filter(view => view.pageUrl);

const slugs = pageViews.map(view => view.pageSlug);
if (new Set(slugs).size !== slugs.length) {
  throw new Error(`Two projects share a page slug: ${slugs.join(', ')}`);
}

rmSync(join(ROOT, 'projects'), { recursive: true, force: true });
pageViews.forEach((view, index) => {
  const dir = join(ROOT, 'projects', view.pageSlug);
  mkdirSync(dir, { recursive: true });
  const image = shareImage(view, path => existsSync(join(ROOT, path)));
  writeFileSync(
    join(dir, 'index.html'),
    renderProjectPage({
      view,
      prev: pageViews[index - 1] ?? null,
      next: pageViews[index + 1] ?? null,
      image,
    })
  );
});
console.log(`  wrote ${pageViews.length} project pages`);

// The sitemap's "Project Pages" block
{
  const sitemap = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  const from = sitemap.indexOf('  <!-- Project Pages -->\n');
  const to = sitemap.indexOf('  <!-- Blog Posts -->');
  if (from === -1 || to === -1 || to < from) {
    throw new Error('sitemap.xml is missing the "Project Pages" / "Blog Posts" markers');
  }
  const entries = pageViews
    .map(
      view => `  <url>
    <loc>${SITE}${view.pageUrl}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`
    )
    .join('\n');
  const heading = '  <!-- Project Pages -->\n';
  writeFileSync(
    join(ROOT, 'sitemap.xml'),
    `${sitemap.slice(0, from)}${heading}${entries}\n${sitemap.slice(to)}`
  );
}

const indexPath = join(ROOT, 'index.html');
let index = readFileSync(indexPath, 'utf8');
index = fillBlock(index, 'lead', lead);
index = fillBlock(index, 'projects', cards);
index = fillBlock(index, 'more', more);
index = fillBlock(index, 'facts', renderFacts(experienceData.experience));
index = fillBlock(index, 'experience', renderJobs(experienceData.experience));
index = fillBlock(index, 'education', renderEducation(experienceData.education));
index = fillBlock(index, 'writing', renderPostRows(posts));
writeFileSync(indexPath, index);
console.log(
  `  wrote index.html (${counts.lead} lead, ${counts.cards} cards, ${counts.more} in the list, ` +
    `${posts.length} posts)`
);

// ── images/projects/<name>-cover-*.svg (every card without a screenshot; see coverFiles) ───────
const coverDir = join(ROOT, 'images', 'projects');
mkdirSync(coverDir, { recursive: true });
const covers = new Set();
for (const { file, name, scheme } of coverFiles(splitProjects(views).grid, pageViews)) {
  writeFileSync(join(coverDir, file), renderCover(name, scheme));
  covers.add(file);
}
// A project that gained a screenshot, or is no longer a card, no longer needs its cover
for (const file of readdirSync(coverDir)) {
  if (/-cover-(light|dark)\.svg$/.test(file) && !covers.has(file)) rmSync(join(coverDir, file));
}
console.log(`  wrote ${covers.size} cover images`);
