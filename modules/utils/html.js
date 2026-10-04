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
