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
