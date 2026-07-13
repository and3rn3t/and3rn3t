/**
 * Cloudflare Worker — dynamic OG image generator
 *
 * GET /og               → portfolio overview card (1200×630 SVG)
 * GET /og?project=slug  → per-project case-study card
 *
 * Data is fetched from the production site (github-data.json + projects-data.json)
 * and cached at the CF edge so the origin is hit at most once per cache window.
 *
 * Returns image/svg+xml — rendered natively by Discord, Slack, Telegram,
 * iMessage, and all Chromium-based scrapers. No WASM or npm dependencies.
 */

const SITE_URL = 'https://andernet.dev';
const DATA_CACHE_TTL = 6 * 60 * 60; // 6 h — aligns with daily workflow
const PROJECTS_CACHE_TTL = 24 * 60 * 60; // 24 h

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

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Handle a GET /og request.
 * No CORS headers needed — OG images are fetched directly by scrapers.
 */
export async function handleOgRequest(request) {
    const url = new URL(request.url);
    const projectSlug = url.searchParams.get('project') ?? '';

    let svg;
    try {
        if (projectSlug) {
            const [ghData, projectsData] = await Promise.all([
                fetchJson(`${SITE_URL}/github-data.json`, DATA_CACHE_TTL),
                fetchJson(`${SITE_URL}/projects-data.json`, PROJECTS_CACHE_TTL),
            ]);
            const project = findProject(projectsData, projectSlug);
            const repoStats = findRepoStats(ghData, projectSlug);
            svg = project ? renderProjectCard(project, repoStats) : renderPortfolioCard(ghData);
        } else {
            const ghData = await fetchJson(`${SITE_URL}/github-data.json`, DATA_CACHE_TTL);
            svg = renderPortfolioCard(ghData);
        }
    } catch {
        svg = renderFallbackCard();
    }

    return new Response(svg, {
        headers: {
            'Content-Type': 'image/svg+xml; charset=utf-8',
            // Serve from edge for up to 6 h; clients can cache for 1 h.
            'Cache-Control': `public, max-age=3600, s-maxage=${DATA_CACHE_TTL}`,
        },
    });
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

async function fetchJson(url, ttl) {
    const resp = await fetch(url, {
        cf: { cacheTtl: ttl, cacheEverything: true },
        headers: { 'User-Agent': 'and3rn3t-portfolio-worker/1.0 (og-image)' },
    });
    if (!resp.ok) throw new Error(`${resp.status} ${url}`);
    return resp.json();
}

export function findProject(projectsData, slug) {
    const projects = projectsData?.projects ?? [];
    return (
        projects.find(
            p =>
                p.name === slug ||
                p.github_repo?.split('/').pop() === slug ||
                p.name?.toLowerCase() === slug.toLowerCase()
        ) ?? null
    );
}

export function findRepoStats(ghData, slug) {
    const repos = ghData?.repositories ?? [];
    return repos.find(r => r.name === slug || r.name?.toLowerCase() === slug.toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// Portfolio card
// ---------------------------------------------------------------------------

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
            const rect = `<rect x="${barX}" y="${BAR_Y}" width="${w}" height="${BAR_H}" rx="3" fill="${escSvg(LANG_COLORS[name] ?? FALLBACK_LANG_COLOR)}"/>`;
            barX += w;
            return rect;
        })
        .join('');

    // Language legend rows (max 5, two columns if needed).
    const langLegend = topLangs
        .map(({ name, pct }, i) => {
            const lx = BAR_X + (i >= 3 ? 240 : 0);
            const ly = BAR_Y + 36 + (i % 3) * 28;
            const color = escSvg(LANG_COLORS[name] ?? FALLBACK_LANG_COLOR);
            return `
            <circle cx="${lx + 6}" cy="${ly - 4}" r="6" fill="${color}"/>
            <text x="${lx + 18}" y="${ly}" font-family="system-ui,sans-serif" font-size="20" fill="#9ca3af">
                ${escSvg(name)} <tspan fill="#6b7280">${Math.round(pct * 100)}%</tspan>
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
            <text x="${sx}" y="370" font-family="system-ui,sans-serif" font-size="44" font-weight="700" fill="#16a34a">${escSvg(String(value))}</text>
            <text x="${sx}" y="398" font-family="system-ui,sans-serif" font-size="20" fill="#6b7280">${escSvg(label)}</text>`;
        })
        .join('');

    return svg1200x630(`
        ${dotGrid()}
        ${leftBar()}

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
    `);
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

export function renderProjectCard(project, repoStats) {
    const name = escSvg(project.displayName ?? project.name);
    const desc = escSvg(truncate(project.description ?? '', 82));
    const category = escSvg(project.category ?? '');
    const techs = (project.technologies ?? []).slice(0, 4);
    const stars = repoStats?.stargazers_count ?? 0;
    const forks = repoStats?.forks_count ?? 0;

    // Tech tag pills.
    let techX = 80;
    const techPills = techs
        .map(t => {
            const color = LANG_COLORS[t] ?? FALLBACK_LANG_COLOR;
            const w = Math.min(t.length * 12 + 28, 160);
            const pill = `
            <rect x="${techX}" y="420" width="${w}" height="34" rx="6" fill="#1f2937" stroke="${escSvg(color)}" stroke-width="1.5"/>
            <text x="${techX + w / 2}" y="443" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" fill="${escSvg(color)}">${escSvg(t)}</text>`;
            techX += w + 12;
            return pill;
        })
        .join('');

    const statsText = stars || forks ? `★ ${stars}   ⑂ ${forks}` : '';

    return svg1200x630(`
        ${dotGrid()}
        ${leftBar()}

        <!-- Category badge -->
        <rect x="80" y="100" width="${category.length * 13 + 32}" height="36" rx="18" fill="#14532d"/>
        <text x="${80 + (category.length * 13 + 32) / 2}" y="124" text-anchor="middle" font-family="system-ui,sans-serif" font-size="18" font-weight="600" fill="#4ade80">${category}</text>

        <!-- Project name -->
        <text x="80" y="230" font-family="system-ui,sans-serif" font-size="56" font-weight="700" fill="#f9fafb" letter-spacing="-1">${name}</text>

        <!-- Description -->
        <text x="80" y="290" font-family="system-ui,sans-serif" font-size="26" fill="#9ca3af">${desc}</text>

        <!-- Divider -->
        <line x1="80" y1="330" x2="680" y2="330" stroke="#1f2937" stroke-width="1.5"/>

        <!-- Stars / Forks -->
        <text x="80" y="386" font-family="system-ui,sans-serif" font-size="28" fill="#16a34a">${escSvg(statsText)}</text>

        <!-- Tech tags -->
        ${techPills}

        <!-- Bottom -->
        <text x="80" y="598" font-family="system-ui,sans-serif" font-size="22" fill="#4b5563">andernet.dev · github.com/and3rn3t/${escSvg(project.github_repo?.split('/').pop() ?? project.name)}</text>
    `);
}

// ---------------------------------------------------------------------------
// Fallback card (shown when data fetch fails)
// ---------------------------------------------------------------------------

function renderFallbackCard() {
    return svg1200x630(`
        ${leftBar()}
        <text x="80" y="295" font-family="system-ui,sans-serif" font-size="58" font-weight="700" fill="#f9fafb">Matthew Anderson</text>
        <text x="80" y="355" font-family="system-ui,sans-serif" font-size="30" fill="#9ca3af">Software Engineer · Deere &amp; Company</text>
        <text x="80" y="450" font-family="system-ui,sans-serif" font-size="22" fill="#4b5563">andernet.dev · github.com/and3rn3t</text>
    `);
}

// ---------------------------------------------------------------------------
// SVG building blocks
// ---------------------------------------------------------------------------

function svg1200x630(content) {
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
  ${content}
</svg>`;
}

function leftBar() {
    return `<rect x="0" y="0" width="8" height="630" fill="#16a34a"/>`;
}

function dotGrid() {
    // Already in svg1200x630 defs — this returns empty so callers can still call it.
    return '';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escSvg(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function truncate(str, max) {
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}
