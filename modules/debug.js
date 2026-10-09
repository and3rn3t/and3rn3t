/**
 * Debug Utilities Module
 * Provides conditional logging based on DEBUG_MODE flag
 */

// Debug mode flag - set to true for testing, false for production
const DEBUG_MODE = false;

// Debug logging wrapper - only logs when DEBUG_MODE is true
export const debug = {
    log: (...args) => DEBUG_MODE && console.log(...args),
    warn: (...args) => DEBUG_MODE && console.warn(...args),
    error: (...args) => console.error(...args), // Always show errors
};
