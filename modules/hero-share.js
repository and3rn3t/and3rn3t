/**
 * The shared hero (lab experiment `hero-shared`): everyone who switched it on bends the same flow
 * field. A pointer moving over the hero is sent over the page's presence socket as one quantised
 * position, and arrives on the other pages that opted in, where it pulls the field the way a local
 * pointer does. Nothing is stored or recorded, and a position says nothing about who moved it
 * (worker/presence.js has the other half and the limits).
 *
 * Positions are sent only while at least two pages have opted in, at most about six a second, and
 * only while the pointer is over the hero in a tab that is showing. The first half of this file is
 * pure so tests can run it without a page.
 */

/** The shortest time between two gusts sent from this page; the Worker drops anything faster. */
export const GUST_INTERVAL_MS = 150;
/** Pages that must have opted in before a position is worth sending. */
export const MIN_SHARING = 2;
/** How hard another visitor's pointer pulls, against 1 for this page's own. */
export const REMOTE_STRENGTH = 0.7;

/**
 * A pointer position over the hero as the message the Worker takes: -1..1 on each axis becomes 0..255.
 * @param {number} x
 * @param {number} y
 * @returns {string | null} null when the pointer is not over the hero
 */
export function encodeGust(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1 || Math.abs(y) > 1)
        return null;
    const cell = value => Math.round(((value + 1) / 2) * 255);
    return `g ${cell(x)} ${cell(y)}`;
}

/**
 * A message from the Worker: a gust as a position in -1..1, the number of pages sharing, or nothing.
 * @param {string} data
 * @returns {{ gust?: { x: number, y: number }, sharing?: number, refused?: boolean }}
 */
export function parseShareMessage(data) {
    try {
        const message = JSON.parse(data);
        const result = {};
        if (
            Array.isArray(message.g) &&
            message.g.length === 2 &&
            message.g.every(cell => Number.isInteger(cell) && cell >= 0 && cell <= 255)
        ) {
            const axis = cell => (cell / 255) * 2 - 1;
            result.gust = { x: axis(message.g[0]), y: axis(message.g[1]) };
        }
        if (
            Number.isInteger(message.sharing) &&
            message.sharing >= 0 &&
            message.sharing <= 100_000
        ) {
            result.sharing = message.sharing;
        }
        if (message.share === false) result.refused = true;
        return result;
    } catch {
        return {};
    }
}

/**
 * Join the shared field.
 * @param {{ nudge?: (x: number, y: number, strength?: number) => void }} hero - the mounted hero
 * @param {HTMLCanvasElement} canvas - the hero's canvas, to place the pointer on it
 * @param {{ onMessage: Function, onOpen: Function, send: (text: string) => boolean,
 *   now?: () => number }} presence - the page's presence socket (modules/edge.js)
 * @returns {() => void} leaves
 */
export function startSharedField(hero, canvas, presence) {
    const { now = () => performance.now() } = presence;
    let sharing = 0;
    let joined = true;
    let lastSent = -Infinity;

    const stopOpen = presence.onOpen(() => presence.send('share'));
    const stopMessages = presence.onMessage(data => {
        const { gust, refused, sharing: count } = parseShareMessage(data);
        if (count !== undefined) sharing = count;
        if (refused) joined = false; // the room is full: take no further part
        if (gust && joined && !document.hidden) {
            hero.nudge?.(gust.x, gust.y, REMOTE_STRENGTH);
        }
    });

    const onPointerMove = event => {
        if (!joined || sharing < MIN_SHARING || document.hidden) return;
        const time = now();
        if (time - lastSent < GUST_INTERVAL_MS) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const gust = encodeGust(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            ((event.clientY - rect.top) / rect.height) * 2 - 1
        );
        if (gust && presence.send(gust)) lastSent = time;
    };
    globalThis.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
        stopOpen();
        stopMessages();
        globalThis.removeEventListener('pointermove', onPointerMove);
    };
}
