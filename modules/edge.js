/**
 * Edge receipt: a footer line saying where this visit was served, e.g.
 * "Served from ORD · API 38 ms · Worker abc1234".
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
