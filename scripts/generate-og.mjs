/**
 * Generate static PNG Open Graph images from the Worker's SVG card renderers.
 *
 * Twitter/X and Facebook do not render SVG og:image URLs, so we rasterize the
 * same 1200×630 cards to PNG at build time and serve them as static files:
 *
 *   og/default.png     — portfolio overview card (used by index.html metas)
 *   og/<repo>.png      — per-project case-study cards
 *
 * Rasterization uses Playwright's bundled Chromium (already a devDependency
 * for e2e tests) with the site's own Inter variable font, so the cards match
 * across local and CI runs. Data comes from the local github-data.json and
 * projects-data.json — no network access needed.
 *
 * Usage: pnpm generate:og
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { findRepoStats, renderPortfolioCard, renderProjectCard } from '../worker/og.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'og');
const WIDTH = 1200;
const HEIGHT = 630;

const ghData = JSON.parse(readFileSync(join(ROOT, 'github-data.json'), 'utf8'));
const projectsData = JSON.parse(readFileSync(join(ROOT, 'projects-data.json'), 'utf8'));
const interWoff2 = readFileSync(join(ROOT, 'fonts', 'inter-variable.woff2')).toString('base64');

/** Wrap a card SVG in a page that swaps system-ui for the site's Inter font. */
function pageHtml(svg) {
  return `<!doctype html><meta charset="utf-8"><style>
      @font-face {
        font-family: 'Inter Card';
        src: url(data:font/woff2;base64,${interWoff2}) format('woff2');
        font-weight: 100 900;
      }
      html, body { margin: 0; padding: 0; }
      svg text { font-family: 'Inter Card', system-ui, sans-serif; }
    </style>${svg}`;
}

async function renderPng(page, svg, outFile) {
  await page.setContent(pageHtml(svg));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: outFile,
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
  });
  console.log(`  wrote ${outFile.replace(`${ROOT}/`, '')}`);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});

console.log('Generating OG images...');
await renderPng(page, renderPortfolioCard(ghData), join(OUT_DIR, 'default.png'));

for (const project of projectsData.projects ?? []) {
  const slug = project.github_repo?.split('/').pop() ?? project.name;
  const repoStats = findRepoStats(ghData, slug);
  await renderPng(page, renderProjectCard(project, repoStats), join(OUT_DIR, `${slug}.png`));
}

await browser.close();
console.log('Done.');
