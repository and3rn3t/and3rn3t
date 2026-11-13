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
 *   404.html                 - the not-found page, on the same head, nav and footer
 *   feed.xml                 - RSS feed (links and ids point at the post pages)
 *   sitemap.xml              - the "Blog Posts" block is rewritten; the rest is left alone
 *   llms.txt                 - the projects, posts and work history as a Markdown link list,
 *                              for language models and agents (https://llmstxt.org)
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
import { projectView, selectProjects } from '../modules/utils/projects.js';
import { renderEducation, renderFacts, renderJobs } from './templates/experience.mjs';
import { AUTHOR, SITE } from './templates/chrome.mjs';
import { renderCover } from './templates/cover.mjs';
import { renderLlmsTxt } from './templates/llms.mjs';
import { renderNotFoundPage } from './templates/not-found.mjs';
import { renderStatusPage } from './templates/status-page.mjs';
import { renderPostPage } from './templates/post-page.mjs';
import { renderProjectPage, shareImage } from './templates/project-page.mjs';
import { coverFiles, renderProjects, splitProjects } from './templates/projects.mjs';
import { renderPostRows } from './templates/writing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const { posts } = JSON.parse(readFileSync(join(ROOT, 'posts-data.json'), 'utf8'));
// Newest first, whatever order the data file is in
posts.sort((a, b) => b.date.localeCompare(a.date));

const esc = escapeHtml;

const postUrl = post => `${SITE}/posts/${post.slug}/`;

const rfc822 = dateStr => new Date(`${dateStr}T00:00:00Z`).toUTCString().replace('GMT', '+0000');

// ── posts/<slug>/index.html ──────────────────────────────────────────────────
rmSync(join(ROOT, 'posts'), { recursive: true, force: true });
posts.forEach((post, index) => {
  const dir = join(ROOT, 'posts', post.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    renderPostPage({ post, newer: posts[index - 1], older: posts[index + 1] })
  );
  console.log(`  wrote posts/${post.slug}/index.html`);
});

// ── 404.html ─────────────────────────────────────────────────────────────────
writeFileSync(join(ROOT, '404.html'), renderNotFoundPage());
console.log('  wrote 404.html');

// ── status/index.html ────────────────────────────────────────────────────────
mkdirSync(join(ROOT, 'status'), { recursive: true });
writeFileSync(join(ROOT, 'status', 'index.html'), renderStatusPage());
console.log('  wrote status/index.html');

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

// ── llms.txt (the site, described for language models) ───────────────────────────────────────
writeFileSync(
  join(ROOT, 'llms.txt'),
  renderLlmsTxt({
    projects: pageViews,
    posts,
    experience: experienceData.experience,
    education: experienceData.education,
  })
);
console.log('  wrote llms.txt');

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
