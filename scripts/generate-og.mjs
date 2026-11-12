/**
 * Generate the static PNG Open Graph image from the portfolio card (scripts/og-card.mjs).
 *
 * Twitter/X and Facebook do not render SVG og:image URLs, so the 1200×630 card is
 * rasterized to PNG at build time and served as a static file:
 *
 *   og/default.png     — portfolio overview card (used by index.html and the post pages)
 *
 * Rasterization uses Playwright's bundled Chromium (already a devDependency
 * for e2e tests) with the site's own Inter variable font, so the card matches
 * across local and CI runs. Data comes from the local github-data.json — no
 * network access needed.
 *
 * Usage: pnpm generate:og
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { renderPortfolioCard } from './og-card.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'og');
const WIDTH = 1200;
const HEIGHT = 630;

const ghData = JSON.parse(readFileSync(join(ROOT, 'github-data.json'), 'utf8'));
const interWoff2 = readFileSync(join(ROOT, 'fonts', 'inter-variable.woff2')).toString('base64');
const monoWoff2 = readFileSync(join(ROOT, 'fonts', 'jetbrains-mono-500.woff2')).toString('base64');

/** Wrap a card SVG in a page that swaps in the site's fonts: Inter, and JetBrains Mono for .mono. */
function pageHtml(svg) {
  return `<!doctype html><meta charset="utf-8"><style>
      @font-face {
        font-family: 'Inter Card';
        src: url(data:font/woff2;base64,${interWoff2}) format('woff2');
        font-weight: 100 900;
      }
      @font-face {
        font-family: 'Mono Card';
        src: url(data:font/woff2;base64,${monoWoff2}) format('woff2');
        font-weight: 500;
      }
      html, body { margin: 0; padding: 0; }
      svg text { font-family: 'Inter Card', system-ui, sans-serif; }
      svg text.mono { font-family: 'Mono Card', ui-monospace, monospace; font-weight: 500; }
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

await browser.close();
console.log('Done.');
