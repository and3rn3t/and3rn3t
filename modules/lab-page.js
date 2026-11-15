/**
 * The lab page (/lab/): the switches. scripts/templates/lab-page.mjs draws the list; this file
 * says whether this browser can run each experiment and saves the visitor's switches, which
 * main.js reads through `lab()` in capabilities.js. Without JavaScript the "Try it once" links work.
 */

import { lab, setLab } from './capabilities.js';

/** What each "needs" value looks like in this browser. A name not listed is assumed to work. */
const SUPPORT = {
    WebGPU: () => 'gpu' in globalThis.navigator,
    WebAssembly: () => typeof globalThis.WebAssembly === 'object',
};

/**
 * @param {string} needs
 * @returns {boolean}
 */
export function canRun(needs) {
    return (SUPPORT[needs] ?? (() => true))();
}

function init() {
    for (const item of document.querySelectorAll('[data-lab-item]')) {
        const note = item.querySelector('[data-lab-support]');
        const supported = canRun(item.dataset.needs ?? '');
        if (note) {
            note.textContent = supported ? '(this browser has it)' : '(this browser does not)';
        }
        const toggle = item.querySelector('[data-lab-toggle]');
        const wrapper = item.querySelector('[data-lab-switch]');
        if (!toggle || !wrapper) {
            continue;
        }
        const flag = toggle.dataset.labToggle ?? '';
        wrapper.hidden = false;
        toggle.checked = lab(flag);
        toggle.addEventListener('change', () => {
            if (!setLab(flag, toggle.checked)) {
                toggle.checked = !toggle.checked;
            }
        });
    }
}

if (typeof document !== 'undefined') {
    init();
}
