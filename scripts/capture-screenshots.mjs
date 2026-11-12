/**
 * Capture project screenshots for the cards and case studies.
 *
 *   pnpm capture:screenshots              every project with a `screenshot.url`
 *   pnpm capture:screenshots health       only the named projects
 *
 * Each project's live demo (`screenshot.url` in projects-data.json) is opened at 1440x900 in
 * light and dark, and written to images/projects/ as:
 *
 *   <name>-<light|dark>-<640|1200>.<avif|webp>   what the cards and project pages show
 *   <name>-og.jpg                                1200x630 share card (scrapers ignore AVIF/WebP)
 *
 * Manual, not part of CI: it needs the network and Chromium, and the demos change when their
 * owners do. Look at the result before committing it: a demo that shows a sign-in screen or an
 * empty state needs a different URL (or no screenshot, which falls back to a generated cover).
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'images', 'projects');

const VIEWPORT = { width: 1440, height: 900 };
const WIDTHS = [1200, 640];
const OG = { width: 1200, height: 630 };
const SCHEMES = ['light', 'dark'];
const SETTLE_MS = 2500; // after network idle, for charts and entrance animations

const only = new Set(process.argv.slice(2));
const { projects } = JSON.parse(readFileSync(join(ROOT, 'projects-data.json'), 'utf8'));
const targets = projects.filter(
  project => project.screenshot?.url && (only.size === 0 || only.has(project.name))
);

if (targets.length === 0) {
  console.error(`No project with a screenshot.url${only.size ? ` matches ${[...only]}` : ''}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

try {
  for (const project of targets) {
    for (const scheme of SCHEMES) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        colorScheme: scheme,
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      await page.goto(project.screenshot.url, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.waitForTimeout(SETTLE_MS);
      const shot = await page.screenshot({ type: 'png' });
      await context.close();

      for (const width of WIDTHS) {
        const height = Math.round((width * VIEWPORT.height) / VIEWPORT.width);
        const resized = sharp(shot).resize(width, height);
        const base = join(OUT_DIR, `${project.name}-${scheme}-${width}`);
        await resized.clone().avif({ quality: 52, effort: 6 }).toFile(`${base}.avif`);
        await resized.clone().webp({ quality: 78, effort: 6 }).toFile(`${base}.webp`);
      }

      if (scheme === 'light') {
        await sharp(shot)
          .resize(OG.width, OG.height, { fit: 'cover', position: 'top' })
          .jpeg({ quality: 82, mozjpeg: true })
          .toFile(join(OUT_DIR, `${project.name}-og.jpg`));
      }
      console.log(`  ${project.name} (${scheme}) from ${project.screenshot.url}`);
    }
  }
} finally {
  await browser.close();
}
console.log(`Wrote images/projects/. Review them before committing.`);
