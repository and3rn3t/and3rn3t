/**
 * Debug Utilities Module
 *
 * The site's modules log what they skip and why through `debug.log` and `debug.warn`. They stay
 * quiet unless asked: `?debug` (or `?debug=1`) turns logging on and remembers it in this browser,
 * `?debug=0` turns it off again. Errors always reach the console.
 */

/** localStorage key for the debug switch (a preference, never sent anywhere). */
export const DEBUG_STORAGE_KEY = 'debug';

/**
 * Whether debug logging is on. Pure so tests can run it without a page.
 * @param {string} search - location.search
 * @param {string | null} stored - the saved value
 * @returns {boolean} what the address says, else the saved choice
 */
export function parseDebugMode(search, stored) {
    const query = new URLSearchParams(search);
    if (query.has('debug')) {
        return query.get('debug') !== '0';
    }
    return stored === '1';
}

/**
 * Reads the switch and remembers a choice made in the address. localStorage throws in private
 * windows and with blocked site data; logging then follows the address alone.
 * @returns {boolean}
 */
function readDebugMode() {
    const search = globalThis.location?.search ?? '';
    try {
        const storage = globalThis.localStorage;
        const on = parseDebugMode(search, storage?.getItem(DEBUG_STORAGE_KEY) ?? null);
        if (new URLSearchParams(search).has('debug')) {
            if (on) {
                storage?.setItem(DEBUG_STORAGE_KEY, '1');
            } else {
                storage?.removeItem(DEBUG_STORAGE_KEY);
            }
        }
        return on;
    } catch {
        return parseDebugMode(search, null);
    }
}

const DEBUG_MODE = readDebugMode();

export const debug = {
    log: (...args) => DEBUG_MODE && console.log(...args),
    warn: (...args) => DEBUG_MODE && console.warn(...args),
    error: (...args) => console.error(...args), // Always show errors
};
