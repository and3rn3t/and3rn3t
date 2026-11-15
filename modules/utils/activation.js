/**
 * Pages that are prerendered (speculation rules, see SPECULATION_RULES in
 * scripts/templates/chrome.mjs) run their scripts before the visitor has opened them. Anything
 * that counts the visit, opens a connection that means "here now", or times a request from the
 * visitor's side must wait until the page is shown.
 */

/**
 * @returns {Promise<void>} resolves at once for a page that is open, and when the visitor opens a
 *   prerendered one
 */
export function whenActivated() {
    if (!document.prerendering) return Promise.resolve();
    return new Promise(resolve => {
        document.addEventListener('prerenderingchange', () => resolve(), { once: true });
    });
}
