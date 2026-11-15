/**
 * Post page script — the generated pages under /posts/<slug>/ only need the theme toggle.
 */

import { initThemeManager } from './theme.js';

initThemeManager();

// The footer's "served from" line: a nicety, so it starts when the browser is idle
const whenIdle = task =>
    globalThis.requestIdleCallback ? globalThis.requestIdleCallback(task) : setTimeout(task, 2000);
whenIdle(() => import('./edge.js').then(m => m.initEdge()).catch(() => {}));

// Lab experiments, off unless switched on (see /lab/). `labModule` loads a module only when its
// switch is on, so a page without it never fetches the module.
const labModule = async (flag, load) => {
    const { lab } = await import('./capabilities.js');
    return lab(flag) ? load() : null;
};
// The agent view, on every page
whenIdle(() =>
    labModule('agent-view', () => import('./agent-view.js'))
        .then(m => m?.initAgentView())
        .catch(() => {})
);
// Key points and translation made on the device: posts only, and only where the browser has an API
whenIdle(() =>
    labModule('post-tools', async () =>
        'Summarizer' in globalThis || 'Translator' in globalThis ? import('./post-tools.js') : null
    )
        .then(m => m?.initPostTools())
        .catch(() => {})
);
