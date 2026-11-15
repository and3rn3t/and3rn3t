/**
 * GitHub's language colours, for the project cards (modules/utils/projects.js) and the Open Graph
 * card (scripts/og-card.mjs). The colours are data, not theme: they stay GitHub's. Keep this file
 * free of DOM and Node APIs.
 */

const LANGUAGE_COLORS = {
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Swift: '#ffac45',
    Python: '#3572a5',
    HTML: '#e34c26',
    CSS: '#563d7c',
    Shell: '#89e051',
    Go: '#00add8',
    Rust: '#dea584',
    Java: '#b07219',
    Kotlin: '#a97bff',
    Ruby: '#701516',
    'C++': '#f34b7d',
    'C#': '#178600',
    SCSS: '#c6538c',
    Vue: '#41b883',
    Dockerfile: '#384d54',
};

/**
 * @param {string} language
 * @returns {string | null} the language's GitHub colour, if it has one
 */
export function languageColor(language) {
    return LANGUAGE_COLORS[language] ?? null;
}
