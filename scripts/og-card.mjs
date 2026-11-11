/**
 * The portfolio's Open Graph card as a 1200×630 SVG string.
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
  const BAR_Y = 440;
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
      const ly = BAR_Y + 36 + (i % 3) * 28;
      const color = escapeHtml(LANG_COLORS[name] ?? FALLBACK_LANG_COLOR);
      return `
            <circle cx="${lx + 6}" cy="${ly - 4}" r="6" fill="${color}"/>
            <text x="${lx + 18}" y="${ly}" font-family="system-ui,sans-serif" font-size="20" fill="#9ca3af">
                ${escapeHtml(name)} <tspan fill="#6b7280">${Math.round(pct * 100)}%</tspan>
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
      const sx = 80 + i * 175;
      return `
            <text x="${sx}" y="370" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="#16a34a">${escapeHtml(String(value))}</text>
            <text x="${sx}" y="398" font-family="system-ui,sans-serif" font-size="20" fill="#6b7280">${escapeHtml(label)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <pattern id="dots" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#1f2937"/>
    </pattern>
  </defs>
  <!-- Background -->
  <rect width="1200" height="630" fill="#0d1117"/>
  <!-- Dot grid (right panel) -->
  <rect x="620" y="0" width="580" height="630" fill="url(#dots)" opacity="0.6"/>

        <rect x="0" y="0" width="8" height="630" fill="#16a34a"/>

        <!-- Name -->
        <text x="80" y="190" font-family="system-ui,sans-serif" font-size="58" font-weight="700" fill="#f9fafb" letter-spacing="-1">Matthew Anderson</text>

        <!-- Role -->
        <text x="80" y="244" font-family="system-ui,sans-serif" font-size="28" fill="#9ca3af">Software Engineer · Deere &amp; Company</text>

        <!-- Divider -->
        <line x1="80" y1="275" x2="560" y2="275" stroke="#1f2937" stroke-width="1.5"/>

        <!-- Stats -->
        ${statBlocks}

        <!-- Language bar -->
        ${barRects}

        <!-- Language legend -->
        ${langLegend}

        <!-- Right watermark -->
        <text x="660" y="275" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="#6b7280" letter-spacing="1">Top languages</text>

        <!-- Bottom -->
        <text x="80" y="598" font-family="system-ui,sans-serif" font-size="22" fill="#4b5563">andernet.dev · github.com/and3rn3t</text>
</svg>`;
}
