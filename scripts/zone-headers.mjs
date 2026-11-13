/**
 * The response headers andernet.dev sends, as Cloudflare response header transform rules.
 * scripts/cloudflare-zone.mjs applies them; this file only says what they are, so the tests
 * can check them without an API.
 *
 * Every rule is scoped to the apex host. The zone also carries about twenty other hostnames
 * (separate apps), and a header such as COOP or HSTS applied zone-wide would change all of them.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const HOST = 'andernet.dev';

/** Rules this script owns are named with this prefix; any other rule in the phase is left alone. */
export const RULE_PREFIX = 'andernet-';

const ON_SITE = `http.host eq "${HOST}"`;
const ON_HTML = `${ON_SITE} and http.response.content_type.media_type eq "text/html"`;

/** Where an agent finds the API catalog, the OpenAPI document and the plain-text guide (RFC 8288). */
export const LINK_HEADER = [
  '</.well-known/api-catalog>; rel="api-catalog"',
  '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
].join(', ');

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  // Nothing on the site uses these; this stops a script that got in from asking
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  // Six months, this host only (no includeSubDomains, no preload): the other subdomains are
  // other apps, and a preload entry cannot be taken back quickly
  'strict-transport-security': 'max-age=15552000',
};

/** Scripts that run (no src, and not a data block such as application/ld+json). */
const RUNS = /^(module|(text|application)\/javascript)$/i;

/**
 * The inline scripts and styles of one HTML page, exactly as a browser hashes them (the text
 * between the tags, unchanged).
 * @param {string} html
 * @returns {{ scripts: string[], styles: string[] }}
 */
export function inlineBlocks(html) {
  const scripts = [];
  for (const [, attributes = '', body] of html.matchAll(
    /<script(\s[^>]*)?>([\s\S]*?)<\/script\b[^>]*>/gi
  )) {
    if (/\ssrc\s*=/i.test(attributes)) continue;
    const type = attributes.match(/\stype\s*=\s*["']?([^"'\s>]+)/i)?.[1];
    if (type && !RUNS.test(type)) continue;
    scripts.push(body);
  }
  const styles = [...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style\b[^>]*>/gi)].map(
    match => match[1]
  );
  return { scripts, styles };
}

export const cspHash = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

/**
 * The pages the site publishes: every .html file at the root (index, 404 and offline; pages.yml
 * publishes `/*.html`), and every project and post page.
 */
export function pageFiles(root) {
  const files = readdirSync(root)
    .filter(name => name.endsWith('.html'))
    .sort();
  for (const folder of ['projects', 'posts']) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) files.push(`${folder}/${name}/index.html`);
  }
  // The status page is one file in its own folder
  files.push('status/index.html');
  return files.filter(file => existsSync(join(root, file)));
}

/**
 * The hashes of every inline script and style on every page, sorted, each once.
 * @param {string} root - the repository
 * @returns {{ scripts: string[], styles: string[] }}
 */
export function inlineHashes(root) {
  const scripts = new Set();
  const styles = new Set();
  for (const file of pageFiles(root)) {
    const blocks = inlineBlocks(readFileSync(join(root, file), 'utf8'));
    for (const text of blocks.scripts) scripts.add(cspHash(text));
    for (const text of blocks.styles) styles.add(cspHash(text));
  }
  return { scripts: [...scripts].sort(), styles: [...styles].sort() };
}

/**
 * The Content-Security-Policy. Sent report-only first: a violation shows in the browser's
 * console and breaks nothing, so what the pages really load can be checked before enforcing.
 * Inline code is allowed by hash, so a changed inline script needs `pnpm zone --apply` again.
 *
 * @param {{ scripts: string[], styles: string[] }} hashes
 * @returns {string}
 */
export function buildCsp({ scripts, styles }) {
  const directives = {
    'default-src': ["'self'"],
    // 'wasm-unsafe-eval': the hero particle simulation is WebAssembly
    'script-src': [
      "'self'",
      "'wasm-unsafe-eval'",
      ...scripts,
      'https://static.cloudflareinsights.com',
      'https://challenges.cloudflare.com',
    ],
    'style-src': ["'self'", ...styles],
    // Style attributes (not elements), and only attributes: they cannot run script. Needed by the
    // contribution heatmap, which positions about 370 cells with them, and by the hidden link
    // Cloudflare adds to every page. Without this, enforcing the policy would break the heatmap.
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': [
      "'self'",
      'https://cloudflareinsights.com',
      'https://api.github.com',
      'https://and3rn3t-portfolio.andernet.workers.dev',
      'https://formspree.io',
    ],
    'frame-src': ['https://challenges.cloudflare.com'],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'form-action': ["'self'", 'https://formspree.io'],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

const setHeaders = headers =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, { operation: 'set', value }])
  );

const rule = (ref, description, expression, headers) => ({
  [`${RULE_PREFIX}${ref}`]: {
    description,
    expression,
    action: 'rewrite',
    enabled: true,
    action_parameters: { headers: setHeaders(headers) },
  },
});

/**
 * The rules, keyed by ref.
 * @param {{ scripts: string[], styles: string[] }} hashes
 */
export function headerRules(hashes) {
  return {
    ...rule('link-header', 'Link header: where agents find the API and the guide', ON_HTML, {
      link: LINK_HEADER,
    }),
    ...rule('security-headers', 'Security headers for the site', ON_SITE, SECURITY_HEADERS),
    ...rule('csp-report-only', 'Content Security Policy, report-only', ON_HTML, {
      'content-security-policy-report-only': buildCsp(hashes),
    }),
  };
}
