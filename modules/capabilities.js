/**
 * Device Capabilities & Motion Preferences
 *
 * Single source of truth for deciding whether to run "heavy" visual effects
 * (the flow field, tilt, particle overlays). Every enhancement module
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
 * Master gate for expensive, continuously-animating effects.
 * @returns {boolean}
 */
export function canRunHeavyEffects() {
    return !motion.reduced && !prefersReducedData && !isLowEndDevice;
}

/** localStorage key for the lab switches a visitor turned on (a preference, never sent anywhere). */
export const LAB_STORAGE_KEY = 'lab';

/**
 * Which lab experiments are on. Pure so tests can run it without a page: `?lab=a,b` in the address,
 * the names saved from /lab/, and the older `?hero=gpu`, which stays an alias of `hero-gpu`.
 * @param {string} search - location.search
 * @param {string | null} stored - the saved comma-separated names
 * @returns {Set<string>}
 */
export function parseLabFlags(search, stored) {
    const names = new Set();
    const add = list =>
        String(list ?? '')
            .split(',')
            .map(name => name.trim().toLowerCase())
            .filter(name => /^[a-z0-9-]{1,32}$/.test(name))
            .forEach(name => names.add(name));
    const query = new URLSearchParams(search);
    add(query.get('lab'));
    add(stored);
    if (query.get('hero') === 'gpu') {
        names.add('hero-gpu');
    }
    return names;
}

/**
 * Safe localStorage read: private windows and blocked site data throw.
 * @returns {string | null}
 */
function readStoredLab() {
    try {
        return globalThis.localStorage?.getItem(LAB_STORAGE_KEY) ?? null;
    } catch {
        return null;
    }
}

/**
 * Whether an experiment is switched on for this visitor. Every experiment is off unless asked for,
 * so the default page never loads one (tests/e2e/lab.spec.js checks).
 * @param {string} name - the flag in lab-data.json
 * @returns {boolean}
 */
export function lab(name) {
    return parseLabFlags(globalThis.location?.search ?? '', readStoredLab()).has(name);
}

/**
 * Save a switch from /lab/. Returns false when the browser refuses to store it.
 * @param {string} name
 * @param {boolean} on
 * @returns {boolean}
 */
export function setLab(name, on) {
    try {
        const saved = parseLabFlags('', readStoredLab());
        if (on) {
            saved.add(name);
        } else {
            saved.delete(name);
        }
        globalThis.localStorage.setItem(LAB_STORAGE_KEY, [...saved].join(','));
        return true;
    } catch {
        return false;
    }
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

// Keep `motion.reduced` current for the whole session, not only for explicit subscribers.
onReducedMotionChange();
