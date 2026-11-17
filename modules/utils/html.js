/**
 * HTML utilities shared across modules.
 */

/**
 * Escape a value for safe interpolation into innerHTML template literals.
 * Handles null/undefined by returning an empty string.
 *
 * @param {unknown} str - Value to escape
 * @returns {string} HTML-safe string
 */
export function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Return the URL only if it uses an http(s) scheme — rejects javascript:,
 * data: and other unsafe schemes. Relative URLs resolve against the page origin.
 *
 * @param {unknown} url - Candidate URL
 * @returns {string|null} The original URL, or null if unsafe/invalid
 */
export function safeUrl(url) {
    if (!url) return null;
    try {
        const parsed = new URL(String(url), globalThis.location?.origin);
        return ['http:', 'https:'].includes(parsed.protocol) ? String(url) : null;
    } catch {
        return null;
    }
}

// ── Trusted Types (AGENTS.md, "Trusted Types"): every first-party innerHTML and script src goes through here.
// createHTML passes markup through, so callers build it from escapeHtml'd data; createScriptURL is a real
// allowlist. Without Trusted Types the helpers return the plain string.

export const POLICY_NAME = 'andernet';

/** Where a script may come from, apart from this site. */
export const SCRIPT_ORIGINS = new Set([
    'https://challenges.cloudflare.com',
    'https://static.cloudflareinsights.com',
]);

/** @returns {string} the URL, when allowed; throws TypeError otherwise */
export function checkScriptUrl(url, pageOrigin = globalThis.location?.origin) {
    const { origin } = new URL(url, pageOrigin);
    if (origin !== pageOrigin && !SCRIPT_ORIGINS.has(origin)) {
        throw new TypeError(`A script may not be loaded from ${origin}`);
    }
    return url;
}

function createPolicy() {
    try {
        return globalThis.trustedTypes?.createPolicy(POLICY_NAME, {
            createHTML: markup => markup,
            createScriptURL: url => checkScriptUrl(url),
        });
    } catch {
        return null; // named twice, or not in the CSP list: plain strings, and the report says so
    }
}

const policy = createPolicy();

/** @returns {string | TrustedHTML} markup for innerHTML, built from escaped data only */
export function trustedHtml(markup) {
    return policy ? policy.createHTML(markup) : markup;
}

/** @returns {string | TrustedScriptURL} an address for a script's src */
export function trustedScriptUrl(url) {
    return policy ? policy.createScriptURL(url) : checkScriptUrl(url);
}
