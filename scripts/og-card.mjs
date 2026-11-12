/**
 * The portfolio's Open Graph card as a 1200×630 SVG string, in the site's own look: the dark
 * surface and text colours from styles/core.css, Inter for the name and numbers, JetBrains Mono for
 * labels, and green as the one accent (the language colours are GitHub's, because they are data).
 *
 * Pure function of the daily GitHub data, shared by scripts/generate-og.mjs, which rasterizes
 * it to og/default.png (the only OG image the site references). Social platforms do not
 * render SVG og:image URLs, which is why it is turned into a PNG at build time rather than
 * served as SVG.
 */

import { escapeHtml } from '../modules/utils/html.js';

// GitHub language colours (subset; add more as needed).
const LANG_COLORS = {
  TypeScript: '#2b7489',
  JavaScript: '#f1e05a',
  Swift: '#ffac45',
  Python: '#3572a5',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  Kotlin: '#a97bff',
  Ruby: '#701516',
  'C#': '#178600',
  'C++': '#f34b7d',
  Shell: '#89e051',
  Dockerfile: '#384d54',
};

const FALLBACK_LANG_COLOR = '#6b7280';

// The dark theme's tokens (--surface, --text, --muted, --border, --accent in styles/core.css)
const SURFACE = '#0b0d0b';
const TEXT = '#eef1ee';
const MUTED = '#a4aba6';
const BORDER = '#252a25';
const ACCENT = '#4ade80';

// SVG text takes its family from the page that rasterizes it (scripts/generate-og.mjs): the
// class picks the monospace face for labels.
const MONO = 'class="mono" font-family="ui-monospace,monospace"';

/**
 * @param {{ repositories?: Array<{ stargazers_count?: number }>,
 *   contributions?: { total?: number }, languageBytes?: Record<string, number> } | null} ghData
 * @returns {string} SVG markup
 */
export function renderPortfolioCard(ghData) {
  const repos = ghData?.repositories ?? [];
  const repoCount = repos.length;
  const starCount = repos.reduce((s, r) => s + (r.stargazers_count ?? 0), 0);
  const contributions = ghData?.contributions?.total ?? 0;

  // Top 5 languages by bytes.
  const langBytes = ghData?.languageBytes ?? {};
  const totalBytes = Object.values(langBytes).reduce((s, b) => s + b, 0) || 1;
  const topLangs = Object.entries(langBytes)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, bytes]) => ({ name, pct: bytes / totalBytes }));

  // Language bar segments (480px wide, starting at x=660).
  const BAR_X = 660;
  const BAR_Y = 404;
  const BAR_W = 480;
  const BAR_H = 16;
  let barX = BAR_X;
  const barRects = topLangs
    .map(({ name, pct }) => {
      const w = Math.round(BAR_W * pct);
      const rect = `<rect x="${barX}" y="${BAR_Y}" width="${w}" height="${BAR_H}" rx="3" fill="${escapeHtml(LANG_COLORS[name] ?? FALLBACK_LANG_COLOR)}"/>`;
      barX += w;
      return rect;
    })
    .join('');

  // Language legend rows (max 5, two columns if needed).
  const langLegend = topLangs
    .map(({ name, pct }, i) => {
      const lx = BAR_X + (i >= 3 ? 240 : 0);
      const ly = BAR_Y + 54 + (i % 3) * 30;
      const color = escapeHtml(LANG_COLORS[name] ?? FALLBACK_LANG_COLOR);
      return `
            <circle cx="${lx + 6}" cy="${ly - 4}" r="6" fill="${color}"/>
            <text x="${lx + 18}" y="${ly}" font-family="system-ui,sans-serif" font-size="22" fill="${TEXT}">
                ${escapeHtml(name)} <tspan fill="${MUTED}">${Math.round(pct * 100)}%</tspan>
            </text>`;
    })
    .join('');

  // Stat blocks.
  const stats = [
    { value: repoCount, label: 'Repositories' },
    { value: starCount, label: 'Stars' },
    { value: contributions.toLocaleString('en-US'), label: 'Contributions' },
  ];
  const statBlocks = stats
    .map(({ value, label }, i) => {
      const sx = 80 + i * 190;
      return `
            <text x="${sx}" y="424" font-family="system-ui,sans-serif" font-size="60" font-weight="700" letter-spacing="-2" fill="${TEXT}">${escapeHtml(String(value))}</text>
            <text x="${sx}" y="458" ${MONO} font-size="18" fill="${MUTED}">${escapeHtml(label)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${BORDER}"/>
    </pattern>
  </defs>
  <!-- Background -->
  <rect width="1200" height="630" fill="${SURFACE}"/>
  <!-- Dot grid (right panel) -->
  <rect x="620" y="0" width="580" height="630" fill="url(#dots)" opacity="0.7"/>

        <!-- The one accent: a short rule above the handle -->
        <rect x="80" y="72" width="56" height="4" rx="2" fill="${ACCENT}"/>
        <text x="80" y="118" ${MONO} font-size="22" fill="${ACCENT}" letter-spacing="1">@and3rn3t</text>

        <!-- Name -->
        <text x="80" y="214" font-family="system-ui,sans-serif" font-size="76" font-weight="700" fill="${TEXT}" letter-spacing="-3">Matthew Anderson</text>

        <!-- Role -->
        <text x="80" y="266" font-family="system-ui,sans-serif" font-size="28" fill="${MUTED}">Software Engineer · Deere &amp; Company</text>

        <!-- Divider -->
        <line x1="80" y1="316" x2="1120" y2="316" stroke="${BORDER}" stroke-width="2"/>

        <!-- Stats -->
        ${statBlocks}

        <!-- Language bar -->
        ${barRects}

        <!-- Language legend -->
        ${langLegend}

        <!-- Right panel label -->
        <text x="660" y="380" ${MONO} font-size="18" fill="${MUTED}" letter-spacing="1">Top languages</text>

        <!-- Bottom -->
        <text x="80" y="590" ${MONO} font-size="20" fill="${MUTED}">andernet.dev · github.com/and3rn3t</text>
</svg>`;
}
