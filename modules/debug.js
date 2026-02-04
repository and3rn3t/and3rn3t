/**
 * Debug Utilities Module
 * Provides conditional logging based on DEBUG_MODE flag
 */

// Debug mode flag - set to true for testing, false for production
export const DEBUG_MODE = false;

// Debug logging wrapper - only logs when DEBUG_MODE is true
export const debug = {
    log: (...args) => DEBUG_MODE && console.log(...args),
    warn: (...args) => DEBUG_MODE && console.warn(...args),
    error: (...args) => console.error(...args), // Always show errors
    info: (...args) => DEBUG_MODE && console.info(...args),
    table: (...args) => DEBUG_MODE && console.table(...args),
    group: (label) => DEBUG_MODE && console.group(label),
    groupEnd: () => DEBUG_MODE && console.groupEnd(),
    time: (label) => DEBUG_MODE && console.time(label),
    timeEnd: (label) => DEBUG_MODE && console.timeEnd(label)
};

// Utility function for development timing
export function measureTime(label, fn) {
    if (!DEBUG_MODE) {
        return fn();
    }
    
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    debug.log(`[Timing] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
}

// Async version of measureTime
export async function measureTimeAsync(label, fn) {
    if (!DEBUG_MODE) {
        return await fn();
    }
    
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    debug.log(`[Timing] ${label}: ${(end - start).toFixed(2)}ms`);
    return result;
}

export default debug;
