/**
 * Keyboard Help & Go-To Navigation
 *
 * Activates the pre-existing (but previously dead) #keyboard-help panel and
 * makes its advertised shortcuts honest:
 *   - `?`            toggle this help panel
 *   - `g` then h/a/p/c   jump to home / about / projects / contact
 * (Theme `t`, scroll `j`/`k`, search `/`, and `Esc` are wired elsewhere.)
 *
 * Fully keyboard-driven with a focus trap, and dismissible via Esc, the close
 * button, or a click on the backdrop.
 *
 * @author Matthew Anderson
 */

const GO_TO = {
    h: 'home',
    a: 'about',
    p: 'projects',
    c: 'contact'
};

// How long a `g` prefix stays "armed" before it expires (ms).
const GO_TO_WINDOW = 1200;

class KeyboardHelp {
    panel = null;
    closeBtn = null;
    lastFocused = null;
    goToArmed = false;
    goToTimer = 0;
    trapFocus = null;

    init() {
        this.panel = document.getElementById('keyboard-help');
        if (!this.panel) {
            return;
        }
        this.closeBtn = document.getElementById('keyboard-help-close');

        this.closeBtn?.addEventListener('click', () => this.close());
        this.panel.addEventListener('click', (e) => {
            if (e.target === this.panel) {
                this.close();
            }
        });

        document.addEventListener('keydown', (e) => this.onKeydown(e));
    }

    onKeydown(e) {
        // Never hijack keys while the user is typing or using a modifier combo.
        if (e.target.matches('input, textarea, select') || e.isComposing) {
            return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) {
            return;
        }

        if (e.key === '?') {
            e.preventDefault();
            this.toggle();
            return;
        }

        if (this.isOpen() && e.key === 'Escape') {
            this.close();
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
        return this.panel?.classList.contains('visible');
    }

    toggle() {
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (!this.panel || this.isOpen()) {
            return;
        }
        this.lastFocused = document.activeElement;
        this.panel.classList.add('visible');
        this.panel.setAttribute('aria-hidden', 'false');

        this.trapFocus = (e) => this.handleTrap(e);
        document.addEventListener('keydown', this.trapFocus);

        // Focus the close button so Esc/Tab work immediately.
        this.closeBtn?.focus();
    }

    close() {
        if (!this.panel || !this.isOpen()) {
            return;
        }
        this.panel.classList.remove('visible');
        this.panel.setAttribute('aria-hidden', 'true');

        if (this.trapFocus) {
            document.removeEventListener('keydown', this.trapFocus);
            this.trapFocus = null;
        }

        if (this.lastFocused instanceof HTMLElement) {
            this.lastFocused.focus();
        }
        this.lastFocused = null;
    }

    handleTrap(e) {
        if (e.key !== 'Tab') {
            return;
        }
        const focusable = this.panel.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) {
            return;
        }
        const first = focusable[0];
        const last = focusable.at(-1);

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

export const keyboardHelp = new KeyboardHelp();
export default keyboardHelp;
