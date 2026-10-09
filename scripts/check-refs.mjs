#!/usr/bin/env node
/**
 * Check that every local file the site references exists and is published.
 *
 * GitHub Pages serves the raw source (no bundler), so a typo in an import path or a
 * file left out of the Pages sparse checkout only shows up as a 404 in production.
 * This walks the HTML pages, the manifest, the service-worker precache list, CSS
 * url()s and the JS import graph, and fails if a target is missing on disk or isn't
 * matched by the publish allowlist in .github/workflows/pages.yml.
 *
 * Usage: pnpm check:refs
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');

/** Map of referenced repo-relative path -> files that reference it. */
const refs = new Map();
const problems = [];

const SITE_ORIGIN = 'https://andernet.dev';

function addRef(target, from) {
  // Absolute links to this site (og:image, canonical, feed) are local files too.
  if (target.startsWith(`${SITE_ORIGIN}/`)) target = target.slice(SITE_ORIGIN.length);
  const clean = target.split(/[?#]/)[0];
  if (!clean || /^(?:[a-z]+:|\/\/|#|\$\{)/i.test(target)) return; // external, data:, anchors, templates
  const base = clean.startsWith('/') ? ROOT : dirname(join(ROOT, from));
  let path = relative(ROOT, resolve(base, clean.replace(/^\//, '')));
  if (clean.endsWith('/') || path === '') path = join(path, 'index.html');
  if (!refs.has(path)) refs.set(path, new Set());
  refs.get(path).add(from);
}

function walk(dir, ext, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, ext, out);
    else if (name.endsWith(ext)) out.push(rel);
  }
  return out;
}

// HTML pages: src/href attributes (skip <a href> to other sites; anchors are filtered above).
const pages = [
  ...readdirSync(ROOT).filter(name => name.endsWith('.html')), // every root page
  ...walk('posts', '.html'),
];
for (const page of pages) {
  for (const [, url] of read(page).matchAll(/\s(?:src|href)="([^"]+)"/g)) addRef(url, page);
  // Social cards etc. live in content="" (only absolute links to this site count).
  for (const [, url] of read(page).matchAll(/\scontent="(https:\/\/andernet\.dev\/[^"]+)"/g)) {
    addRef(url, page);
  }
}

// Web app manifest icons and screenshots.
const manifest = JSON.parse(read('manifest.json'));
for (const item of [...(manifest.icons ?? []), ...(manifest.screenshots ?? [])]) {
  addRef(item.src, 'manifest.json');
}
// Entry points: start URL, shortcuts and a share target must all resolve to a real page.
const manifestUrls = [
  manifest.start_url,
  ...(manifest.shortcuts ?? []).map(shortcut => shortcut.url),
  manifest.share_target?.action,
];
for (const url of manifestUrls.filter(Boolean)) addRef(url, 'manifest.json');

// Service worker precache list.
const precache = read('sw.js').match(/PRECACHE_ASSETS = \[([\s\S]*?)\]/)?.[1] ?? '';
for (const [, url] of precache.matchAll(/'([^']+)'/g)) addRef(url, 'sw.js');

// CSS url()s.
for (const [, url] of read('styles.css').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
  addRef(url, 'styles.css');
}

// JS: static imports, dynamic imports and literal fetch() paths in the browser code.
const scripts = ['main.js', ...walk('modules', '.js')];
for (const file of scripts) {
  const src = read(file);
  for (const [, url] of src.matchAll(/(?:\bfrom|\bimport\(?)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    addRef(url, file);
  }
  for (const [, url] of src.matchAll(/\bfetch\(\s*['"](\/[^'"]+)['"]/g)) addRef(url, file);
  // Assets resolved against the module itself, e.g. new URL('./x.wasm', import.meta.url).
  for (const [, url] of src.matchAll(
    /new URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url/g
  )) {
    addRef(url, file);
  }
}

// Publish allowlist from the Pages workflow (gitignore-style patterns, non-cone mode).
const patterns = [
  ...(read('.github/workflows/pages.yml')
    .match(/sparse-checkout: \|\n([\s\S]*?)\n\s*sparse-checkout-cone-mode/)?.[1]
    .matchAll(/^\s+(\S+)\s*$/gm) ?? []),
].map(m => m[1]);

function globToRegex(glob) {
  return glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
}
// gitignore semantics: a pattern that matches a directory also matches everything in it.
function isPublished(path) {
  const parts = path.split('/');
  const candidates = parts.map((_, i) => parts.slice(0, i + 1).join('/'));
  return patterns.some(pattern => {
    const anchored = pattern.startsWith('/');
    const body = pattern.replace(/^\//, '').replace(/\/$/, '');
    const re = new RegExp(`^${anchored ? '' : '(?:.*/)?'}${globToRegex(body)}$`);
    const dirOnly = pattern.endsWith('/');
    return candidates.some((c, i) => re.test(c) && (!dirOnly || i < candidates.length - 1));
  });
}

for (const [path, from] of [...refs].sort()) {
  const where = [...from].join(', ');
  if (!existsSync(join(ROOT, path))) problems.push(`missing: ${path} (referenced by ${where})`);
  else if (!isPublished(path)) problems.push(`not published by pages.yml: ${path} (${where})`);
}

if (problems.length) {
  console.error(`check-refs: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`check-refs: ${refs.size} local references OK`);
