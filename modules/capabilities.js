/**
 * Device Capabilities & Motion Preferences
 *
 * Single source of truth for deciding whether to run "heavy" visual effects
 * (WebGL, parallax, tilt, particle/aurora overlays). Every enhancement module
 * should gate itself through `canRunHeavyEffects()` and honour `motion.reduced`.
 *
 * @author Matthew Anderson
 */

/**
 * Reactive motion state. `reduced` updates if the user changes the OS setting
 * mid-session (see `onReducedMotionChange`). Consumers read `motion.reduced`.
 * @type {{ reduced: boolean }}
 */
export const motion = {
    reduced: matchMediaSafe('(prefers-reduced-motion: reduce)'),
};

/**
 * Whether the user has requested reduced data usage (Save-Data header / setting).
 * @type {boolean}
 */
export const prefersReducedData = (() => {
    const conn =
        globalThis.navigator?.connection ||
        globalThis.navigator?.webkitConnection ||
        globalThis.navigator?.mozConnection;
    if (conn?.saveData) {
        return true;
    }
    return matchMediaSafe('(prefers-reduced-data: reduce)');
})();

/**
 * Coarse heuristic for a low-powered device.
 * Uses deviceMemory + hardwareConcurrency where available (graceful when absent).
 * @type {boolean}
 */
export const isLowEndDevice = (() => {
    const memory = globalThis.navigator?.deviceMemory; // GB, Chrome-only
    const cores = globalThis.navigator?.hardwareConcurrency; // most modern browsers
    if (typeof memory === 'number' && memory <= 4) {
        return true;
    }
    if (typeof cores === 'number' && cores <= 4) {
        return true;
    }
    return false;
})();

/**
 * Whether the primary pointer is fine (mouse/trackpad). Touch-only devices
 * skip cursor-reactive effects (tilt/magnetic) that need hover.
 * @type {boolean}
 */
export const hasFinePointer = matchMediaSafe('(hover: hover) and (pointer: fine)');

/**
 * Detect WebGL support once.
 * @type {boolean}
 */
export const supportsWebGL = (() => {
    try {
        const canvas = document.createElement('canvas');
        return Boolean(
            globalThis.WebGLRenderingContext &&
            (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
        );
    } catch {
        return false;
    }
})();

/**
 * Master gate for expensive, continuously-animating effects.
 * @returns {boolean}
 */
export function canRunHeavyEffects() {
    return !motion.reduced && !prefersReducedData && !isLowEndDevice;
}

/**
 * Subscribe to reduced-motion changes. Updates `motion.reduced` and invokes
 * the callback with the new boolean value.
 * @param {(reduced: boolean) => void} [callback]
 * @returns {() => void} unsubscribe
 */
export function onReducedMotionChange(callback) {
    if (typeof globalThis.matchMedia !== 'function') {
        return () => {};
    }
    const mq = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = event => {
        motion.reduced = event.matches;
        callback?.(event.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
}

/**
 * Safe matchMedia evaluation that never throws in non-browser contexts.
 * @param {string} query
 * @returns {boolean}
 */
function matchMediaSafe(query) {
    if (typeof globalThis.matchMedia !== 'function') {
        return false;
    }
    return globalThis.matchMedia(query).matches;
}
