/**
 * Keyboard Help
 *
 * Drives the #keyboard-help <dialog>: `?` toggles it.
 * (`g` then h/a/p/c, which the dialog lists, is handled in main.js: it needs nothing from this
 * module, so it works before the module has loaded. Theme `t` and the `/` palette are wired
 * elsewhere.)
 *
 * It is a native modal dialog, so the browser traps focus, closes it on Esc and puts focus back
 * where it was; this adds the close button and a click on the backdrop.
 *
 * @author Matthew Anderson
 */

class KeyboardHelp {
    panel = null;
    closeBtn = null;

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
        }
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
