/**
 * Edge receipt: a footer line saying where this visit was served, e.g.
 * "Served from ORD · API 38 ms · Worker abc1234", and, beside it, "N here now" when at least
 * two pages of the site are open at this moment (a WebSocket to the Worker's /presence, which
 * is told nothing about the visitor and sends back only a number).
 *
 * It asks the Worker's /edge (which reports the Cloudflare location and the deployed version,
 * and stores nothing) and times the round trip. The line is shown only if both worked, so a
 * failed call leaves the footer as it was.
 */

import { debug } from './debug.js';
import { WORKER_BASE } from './config.js';

/**
 * @param {{ colo?: string | null, version?: string | null }} edge - the Worker's /edge reply
 * @param {number} apiMs - the round trip to the Worker, in milliseconds
 * @returns {string} the line, or '' when there is nothing true to say
 */
export function formatReceipt(edge, apiMs) {
    if (!edge?.colo || !Number.isFinite(apiMs)) return '';
    const parts = [`Served from ${edge.colo}`, `API ${Math.max(1, Math.round(apiMs))} ms`];
    if (edge.version) parts.push(`Worker ${edge.version}`);
    return parts.join(' · ');
}

export async function initEdgeReceipt() {
    const slot = document.querySelector('[data-edge-receipt]');
    if (!slot) return;
    try {
        const started = performance.now();
        const response = await fetch(`${WORKER_BASE}/edge`, {
            signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) return;
        const edge = await response.json();
        const line = formatReceipt(edge, performance.now() - started);
        if (!line) return;
        slot.textContent = line;
        slot.closest('[data-edge-widget]')?.removeAttribute('hidden');
    } catch (err) {
        debug.warn('[Edge] Skipped:', err.message);
    }
}

// ── Presence: "N here now" ───────────────────────────────────────────────────

/** One page is not "here now": the line appears from two. */
export const PRESENCE_MIN = 2;
const PING_MS = 30_000;
const MAX_RETRIES = 5;

/** @returns {string} the WebSocket address of the Worker's /presence */
export function presenceUrl(base = WORKER_BASE, href = globalThis.location?.href) {
    const url = new URL(`${base}/presence`, href);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    return url.href;
}

/** The count in a message from the Worker, or null for anything else (the "pong" included). */
export function parseCount(data) {
    try {
        const { count } = JSON.parse(data);
        return Number.isInteger(count) && count >= 0 && count <= 100_000 ? count : null;
    } catch {
        return null;
    }
}

/** @returns {string} what to show for a count, or '' for none */
export function presenceText(count) {
    return Number.isInteger(count) && count >= PRESENCE_MIN ? `· ${count} here now` : '';
}

/**
 * Keep a socket open while this page is visible, and only then: a hidden tab is not "here", and
 * holds nothing open. A dropped socket is retried with a growing wait, a few times.
 * @returns {() => void} stops it
 */
export function initPresence() {
    const slot = document.querySelector('[data-presence]');
    if (!slot || typeof WebSocket === 'undefined') return () => {};

    let socket = null;
    let retries = 0;
    let retryTimer = null;
    let pingTimer = null;
    let stopped = false;

    const show = count => {
        const text = presenceText(count);
        slot.textContent = text;
        slot.hidden = !text;
    };

    const close = () => {
        clearTimeout(retryTimer);
        clearInterval(pingTimer);
        const old = socket;
        socket = null; // so the old socket's own events are ignored from here on
        old?.close();
        show(null);
    };

    const open = () => {
        if (socket || document.hidden || stopped) return;
        const ws = new WebSocket(presenceUrl());
        socket = ws;
        ws.onopen = () => {
            retries = 0;
            // A ping does not wake the Worker's object; it only keeps idle connections from being dropped
            pingTimer = setInterval(() => ws.readyState === 1 && ws.send('ping'), PING_MS);
        };
        ws.onmessage = event => {
            if (socket !== ws) return;
            const count = parseCount(event.data);
            if (count !== null) show(count);
        };
        ws.onclose = () => {
            if (socket !== ws) return;
            clearInterval(pingTimer);
            socket = null;
            show(null);
            if (!document.hidden && !stopped && retries < MAX_RETRIES) {
                retryTimer = setTimeout(open, Math.min(30_000, 2000 * 2 ** retries++));
            }
        };
        ws.onerror = () => {}; // the close that follows is handled
    };

    const onVisibility = () => (document.hidden ? close() : open());
    document.addEventListener('visibilitychange', onVisibility);
    open();

    return () => {
        stopped = true;
        document.removeEventListener('visibilitychange', onVisibility);
        close();
    };
}

/** The footer's two live parts: where this was served, and how many are here. */
export function initEdge() {
    initPresence();
    return initEdgeReceipt();
}
