/**
 * View Counter Module
 *
 * On init, calls the Worker POST /views?page=home to increment and then
 * displays the total count in any element matching [data-view-count].
 * Silently no-ops if the Worker is not deployed.
 */

import { debug } from './debug.js';
import { WORKER_BASE } from './config.js';

class ViewCounter {
    async init() {
        try {
            const resp = await fetch(`${WORKER_BASE}/views?page=home`, {
                method: 'POST',
                signal: AbortSignal.timeout(4000),
            });
            if (!resp.ok) return;
            const { views } = await resp.json();
            for (const el of document.querySelectorAll('[data-view-count]')) {
                el.textContent = views.toLocaleString('en-US');
                el.closest('.view-count-widget')?.removeAttribute('hidden');
            }
            debug.log('[ViewCounter] Views:', views);
        } catch (err) {
            debug.warn('[ViewCounter] Skipped:', err.message);
        }
    }
}

export const viewCounter = new ViewCounter();
