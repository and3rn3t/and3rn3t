/**
 * Debug logging is off unless the address has ?debug (and not ?debug=0). Errors always show.
 * @param {string} search - location.search
 * @returns {boolean}
 */
export function parseDebugMode(search) {
    const value = new URLSearchParams(search).get('debug');
    return value !== null && value !== '0';
}

const DEBUG_MODE = parseDebugMode(globalThis.location?.search ?? '');

export const debug = {
    log: (...args) => DEBUG_MODE && console.log(...args),
    warn: (...args) => DEBUG_MODE && console.warn(...args),
    error: (...args) => console.error(...args), // Always show errors
};
