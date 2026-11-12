/**
 * View Counter Module
 *
 * Counts one visit per browser session: the first load POSTs to the Worker's
 * /views?page=home to increment, later loads in the same session only GET the total.
 * The total is shown in any element matching [data-view-count]. Silently no-ops if the
 * Worker is not deployed.
 */

import { debug } from './debug.js';
import { WORKER_BASE } from './config.js';

const COUNTED_KEY = 'viewCounted';

// Storage can be blocked (private mode); then every load counts, as it did before.
function alreadyCounted() {
    try {
        return sessionStorage.getItem(COUNTED_KEY) === '1';
    } catch {
        return false;
    }
}

function markCounted() {
    try {
        sessionStorage.setItem(COUNTED_KEY, '1');
    } catch {
        // Nothing to remember it with; the next load will count again.
    }
}

class ViewCounter {
    async init() {
        try {
            const counted = alreadyCounted();
            const resp = await fetch(`${WORKER_BASE}/views?page=home`, {
                method: counted ? 'GET' : 'POST',
                signal: AbortSignal.timeout(4000),
            });
            if (!resp.ok) return;
            if (!counted) markCounted();
            const { views } = await resp.json();
            for (const el of document.querySelectorAll('[data-view-count]')) {
                el.textContent = views.toLocaleString('en-US');
                el.closest('[data-view-widget]')?.removeAttribute('hidden');
            }
            debug.log('[ViewCounter] Views:', views);
        } catch (err) {
            debug.warn('[ViewCounter] Skipped:', err.message);
        }
    }
}

export const viewCounter = new ViewCounter();
