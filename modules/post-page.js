/**
 * Post page script — the generated pages under /posts/<slug>/ only need the theme toggle.
 */

import { initThemeManager } from './theme.js';

initThemeManager();

// The footer's "served from" line: a nicety, so it starts when the browser is idle
const whenIdle = task =>
    globalThis.requestIdleCallback ? globalThis.requestIdleCallback(task) : setTimeout(task, 2000);
whenIdle(() => import('./edge.js').then(m => m.initEdge()).catch(() => {}));
