/**
 * Project list logic shared by the browser (modules/projects.js) and the site generator
 * (scripts/generate-site.mjs). The generator pre-renders the cards into index.html and the
 * browser hydrates them, so both must agree on which projects show, in what order, and what
 * each card says. Keep this file free of DOM and Node APIs.
 */

import { safeUrl } from './html.js';

const LANGUAGE_COLORS = {
    TypeScript: '#2b7489',
    JavaScript: '#f1e05a',
    Swift: '#ffac45',
    Python: '#3572A5',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Go: '#00ADD8',
    Rust: '#dea584',
    Java: '#b07219',
    Kotlin: '#F18E33',
    Ruby: '#701516',
    'C++': '#f34b7d',
    'C#': '#178600',
    SCSS: '#c6538c',
    Vue: '#41b883',
};

const RECENT_WINDOW_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * @param {string} language
 * @returns {string | null} the language's GitHub colour, if it has one
 */
export function languageColor(language) {
    return LANGUAGE_COLORS[language] ?? null;
}

/**
 * Featured projects carry `featured: <rank>` in projects-data.json (a plain `true` ranks last,
 * in file order). They show first, in rank order; the rest keep the order they came in.
 * The order is deliberately stable (not "last pushed") so the pre-rendered HTML only changes
 * when the curated data does.
 *
 * @param {{ metadata: object | null, repo: object | null }[]} projects
 * @returns {{ metadata: object | null, repo: object | null }[]}
 */
export function orderProjects(projects) {
    const rank = project => {
        const { featured } = project.metadata ?? {};
        if (Number.isFinite(featured)) return featured;
        return featured ? Number.POSITIVE_INFINITY : null;
    };
    const featured = projects.filter(project => rank(project) !== null);
    featured.sort((a, b) => {
        const [rankA, rankB] = [rank(a), rank(b)];
        if (rankA === rankB) return 0;
        return rankA < rankB ? -1 : 1;
    });
    const rest = projects.filter(project => rank(project) === null);
    return [...featured, ...rest];
}

/**
 * Curated metadata keyed by project name and by the basename of its `github_repo`
 * (e.g. "and3rn3t/health" -> "health"), so a repo name finds its write-up either way.
 *
 * @param {object[]} curated - projects-data.json's `projects`
 * @returns {Map<string, object>}
 */
export function buildMetaMap(curated) {
    const metaMap = new Map();
    for (const metadata of curated) {
        metaMap.set(metadata.name, metadata);
        const basename = metadata.github_repo?.split('/').pop();
        if (basename && basename !== metadata.name) metaMap.set(basename, metadata);
    }
    return metaMap;
}

/**
 * Which projects to show, in display order.
 *
 * Starred repos are the primary curation signal; projects-data.json supplies the write-ups.
 * Without a starred list the curated file is the list. Featured projects always show, even
 * when they aren't starred.
 *
 * @param {{ projects?: object[] } | null | undefined} projectsData - projects-data.json
 * @param {object[] | null | undefined} repositories - repos from github-data.json
 * @param {string[] | null | undefined} starredNames - selfStarredRepoNames
 * @returns {{ metadata: object | null, repo: object | null }[]}
 */
export function selectProjects(projectsData, repositories, starredNames) {
    const repoMap = new Map((repositories ?? []).map(repo => [repo.name, repo]));
    const curated = projectsData?.projects ?? [];

    const metaMap = buildMetaMap(curated);

    let projects;
    if (starredNames?.length) {
        projects = [...new Set(starredNames)]
            .map(name => ({
                metadata: metaMap.get(name) ?? null,
                repo: repoMap.get(name) ?? null,
            }))
            .filter(({ repo, metadata }) => repo || metadata); // drop ghosts
    } else {
        projects = curated.map(metadata => ({
            metadata,
            repo: repoMap.get(metadata.name) ?? null,
        }));
    }

    const listed = new Set(projects.map(({ metadata, repo }) => metadata?.name ?? repo?.name));
    for (const metadata of curated) {
        if (metadata.featured && !listed.has(metadata.name)) {
            projects.push({ metadata, repo: repoMap.get(metadata.name) ?? null });
        }
    }

    return orderProjects(projects);
}

/**
 * The stable facts about one project: everything a card says that doesn't change from day to
 * day. Stars and "last pushed" are live data and are filled in by the browser.
 *
 * @param {object | null} repo
 * @param {object | null} metadata
 */
export function projectView(repo, metadata) {
    const displayName = metadata?.displayName || repo?.name || 'Untitled';
    const description =
        metadata?.description ||
        repo?.description ||
        'A coding project showcasing development skills.';
    const language = repo?.language || metadata?.technologies?.[0] || 'Code';
    const highlights = metadata?.highlights ?? [];
    const slug = repo?.name || metadata?.name || metadata?.github_repo?.split('/').pop();

    return {
        slug,
        displayName,
        description,
        longDescription: metadata?.longDescription,
        category: metadata?.category,
        status: metadata?.status,
        language,
        technologies: metadata?.technologies ?? [],
        highlights,
        htmlUrl: repo?.html_url || `https://github.com/${metadata?.github_repo || 'and3rn3t'}`,
        // Only http(s) links reach the page: HTML escaping doesn't stop a javascript: URL
        homepage: safeUrl(metadata?.homepage ?? repo?.homepage),
        // Up to three tags beyond the primary language, curated first
        secondaryTags: (metadata?.technologies ?? repo?.topics ?? [])
            .filter(tag => tag.toLowerCase() !== language.toLowerCase())
            .slice(0, 3),
        featured: Boolean(metadata?.featured),
        hasCaseStudy: Boolean(slug && (metadata?.longDescription || highlights.length > 1)),
    };
}

/**
 * @param {string | number | Date | null | undefined} pushedAt
 * @param {number} [now]
 * @returns {boolean} whether the repo was pushed to within the last 180 days
 */
export function isRecentlyPushed(pushedAt, now = Date.now()) {
    if (!pushedAt) return false;
    return now - new Date(pushedAt).getTime() < RECENT_WINDOW_MS;
}

/**
 * Compact relative time: "15m ago", "3d ago", "2mo ago".
 * @param {Date} date
 * @param {number} [now]
 * @returns {string}
 */
export function relativeTime(date, now = Date.now()) {
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 5) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
}
