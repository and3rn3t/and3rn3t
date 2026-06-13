/**
 * Hidden "dev mode" Easter Egg
 *
 * Konami code (↑ ↑ ↓ ↓ ← → ← → B A) reveals a small terminal-style overlay
 * with a typed greeting and a few playful commands. Entirely opt-in and
 * dismissible (Esc / click outside) — invisible to anyone not looking for it,
 * so it stays recruiter-professional.
 *
 * @author Matthew Anderson
 */

import { motion } from './capabilities.js';

const SEQUENCE = [
    'ArrowUp',
    'ArrowUp',
    'ArrowDown',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'ArrowLeft',
    'ArrowRight',
    'b',
    'a'
];

const LINES = [
    '> whoami',
    'matthew-anderson — software engineer @ john deere',
    '> stack --top',
    'typescript · python · swift · dbt · iot',
    '> status',
    'building health tech, home automation & data projects 🌱',
    '> hint',
    "press Cmd/Ctrl-K anywhere to open the command palette.",
    '> exit'
];

class EasterEgg {
    progress = 0;
    overlay = null;

    init() {
        document.addEventListener('keydown', (e) => {
            const expected = SEQUENCE[this.progress];
            if (e.key.toLowerCase() === expected.toLowerCase()) {
                this.progress++;
                if (this.progress === SEQUENCE.length) {
                    this.progress = 0;
                    this.activate();
                }
            } else {
                // Allow restart if the wrong key happens to be a valid first key.
                this.progress = e.key === SEQUENCE[0] ? 1 : 0;
            }
        });
    }

    activate() {
        if (this.overlay) {
            return;
        }
        document.body.classList.add('dev-mode');

        const overlay = document.createElement('div');
        overlay.className = 'dev-terminal-overlay';
        overlay.innerHTML = `
            <div class="dev-terminal" role="dialog" aria-label="Developer mode terminal">
                <div class="dev-terminal-bar">
                    <span class="dev-dot dev-dot--red"></span>
                    <span class="dev-dot dev-dot--amber"></span>
                    <span class="dev-dot dev-dot--green"></span>
                    <span class="dev-terminal-title">andernet — zsh</span>
                </div>
                <pre class="dev-terminal-body" id="dev-terminal-body"></pre>
                <p class="dev-terminal-hint">press <kbd>Esc</kbd> to close</p>
            </div>`;
        document.body.appendChild(overlay);
        this.overlay = overlay;

        const body = overlay.querySelector('#dev-terminal-body');
        this.type(body, LINES);

        const onKey = (e) => {
            if (e.key === 'Escape') {
                this.deactivate();
            }
        };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.deactivate();
            }
        });
        document.addEventListener('keydown', onKey);
        this._onKey = onKey;

        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    type(el, lines) {
        if (motion.reduced) {
            el.textContent = lines.join('\n');
            return;
        }
        let line = 0;
        let char = 0;
        const tick = () => {
            if (!this.overlay) {
                return;
            }
            const current = lines[line];
            el.textContent =
                lines.slice(0, line).join('\n') +
                (line > 0 ? '\n' : '') +
                current.slice(0, char);
            char++;
            if (char > current.length) {
                line++;
                char = 0;
                if (line >= lines.length) {
                    return;
                }
                setTimeout(tick, 220);
            } else {
                setTimeout(tick, 28);
            }
        };
        tick();
    }

    deactivate() {
        if (!this.overlay) {
            return;
        }
        document.body.classList.remove('dev-mode');
        document.removeEventListener('keydown', this._onKey);
        const overlay = this.overlay;
        this.overlay = null;
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
    }
}

export const easterEgg = new EasterEgg();
export default easterEgg;
