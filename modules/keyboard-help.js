/**
 * Keyboard Help & Go-To Navigation
 *
 * Drives the #keyboard-help <dialog> and makes its advertised shortcuts honest:
 *   - `?`            toggle this help dialog
 *   - `g` then h/a/p/c   jump to home / about / projects / contact
 * (Theme `t` and the `/` palette are wired elsewhere.)
 *
 * It is a native modal dialog, so the browser traps focus, closes it on Esc and puts focus back
 * where it was; this adds the close button and a click on the backdrop.
 *
 * @author Matthew Anderson
 */

const GO_TO = {
    h: 'home',
    a: 'about',
    p: 'projects',
    c: 'contact',
};

// How long a `g` prefix stays "armed" before it expires (ms).
const GO_TO_WINDOW = 1200;

class KeyboardHelp {
    panel = null;
    closeBtn = null;
    goToArmed = false;
    goToTimer = 0;

    init() {
        this.panel = document.getElementById('keyboard-help');
        if (!this.panel) {
            return;
        }
        this.closeBtn = document.getElementById('keyboard-help-close');

        this.closeBtn?.addEventListener('click', () => this.close());
        // The dialog has no padding and its content fills it, so a click that lands on the
        // dialog itself is a click on the backdrop.
        this.panel.addEventListener('click', e => {
            if (e.target === this.panel) {
                this.close();
            }
        });

        document.addEventListener('keydown', e => this.onKeydown(e));
    }

    onKeydown(e) {
        // Never hijack keys while the user is typing or using a modifier combo.
        if (e.target.matches('input, textarea, select') || e.isComposing) {
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }
        // Another dialog (the palette) is open: its keys are its own
        if (!this.isOpen() && document.querySelector('dialog[open]')) {
            return;
        }

        if (e.key === '?') {
            e.preventDefault();
            this.toggle();
            return;
        }

        // `g` then a letter → jump to a section.
        if (this.goToArmed) {
            const sectionId = GO_TO[e.key.toLowerCase()];
            this.disarmGoTo();
            if (sectionId) {
                e.preventDefault();
                this.goToSection(sectionId);
            }
            return;
        }

        if (e.key === 'g' || e.key === 'G') {
            this.armGoTo();
        }
    }

    armGoTo() {
        this.goToArmed = true;
        clearTimeout(this.goToTimer);
        this.goToTimer = setTimeout(() => {
            this.goToArmed = false;
        }, GO_TO_WINDOW);
    }

    disarmGoTo() {
        this.goToArmed = false;
        clearTimeout(this.goToTimer);
    }

    goToSection(id) {
        const section = document.getElementById(id);
        if (!section) {
            return;
        }
        const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        // Move focus for keyboard/screen-reader users without forcing a visible outline.
        section.setAttribute('tabindex', '-1');
        section.focus({ preventScroll: true });
    }

    isOpen() {
        return Boolean(this.panel?.open);
    }

    toggle() {
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.panel && !this.isOpen()) {
            this.panel.showModal();
        }
    }

    close() {
        if (this.isOpen()) {
            this.panel.close();
        }
    }
}

export const keyboardHelp = new KeyboardHelp();
