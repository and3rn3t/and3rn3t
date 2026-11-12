/**
 * Contact Form Module
 *
 * Progressive enhancement of #contact-form (issue #231). Without JavaScript the form is a plain
 * POST to Formspree, which redirects back to /#message-sent (see the hidden _next field). With
 * it, the visitor never leaves the page:
 *   - the browser's own validation bubbles are replaced by inline messages next to each field
 *   - the message is sent with fetch (Accept: application/json) and the outcome shown in place
 *   - the button shows it is busy, and a second submit while one is in flight is ignored
 * It also makes the "Copy" button next to the email address work.
 */

import { debug } from './debug.js';

const FALLBACK_EMAIL = 'and3rn3t@icloud.com';
const SEND_TIMEOUT_MS = 15000;

// What each failed check means to a visitor, by field. The first one that applies is shown.
const FIELD_MESSAGES = {
    name: {
        valueMissing: 'Please enter your name.',
        tooShort: 'Your name should be at least 2 characters.',
    },
    email: {
        valueMissing: 'Please enter your email address.',
        typeMismatch: "That doesn't look like an email address.",
    },
    subject: {
        valueMissing: 'Please add a subject.',
        tooShort: 'The subject should be at least 3 characters.',
    },
    message: {
        valueMissing: 'Please write a message.',
        tooShort: 'Your message should be at least 10 characters.',
    },
};

class ContactForm {
    #form = null;
    #button = null;
    #label = null;
    #status = null;
    #sending = false;
    #attempted = false;

    init() {
        this.#form = document.getElementById('contact-form');
        if (!this.#form) return;

        this.#button = this.#form.querySelector('button[type="submit"]');
        this.#label = this.#button?.querySelector('.button__label') ?? null;
        this.#status = this.#form.querySelector('.form-status');

        // We show the messages ourselves; without this the browser would show its own bubble
        // and stop the submit before our handler runs.
        this.#form.noValidate = true;
        this.#form.addEventListener('submit', event => this.#onSubmit(event));

        for (const field of this.#fields()) {
            // Once a field has an error, fix-as-you-type: clear it as soon as it is valid
            field.addEventListener('input', () => {
                if (field.getAttribute('aria-invalid') === 'true') this.#validateField(field);
            });
            // After a first attempt, check a field when the visitor leaves it
            field.addEventListener('blur', () => {
                if (this.#attempted) this.#validateField(field);
            });
        }

        this.#initCopyButtons();
        debug.log('[ContactForm] Initialized');
    }

    /** The fields a visitor fills in (not the hidden redirect or the honeypot). */
    #fields() {
        return [...this.#form.querySelectorAll('.input[required], .textarea[required]')];
    }

    // ── Validation ──────────────────────────────────────────────────────────────

    /** Show or clear the error next to one field. Returns whether the field is valid. */
    #validateField(field, serverMessage = '') {
        const valid = field.checkValidity() && !serverMessage;
        const message = valid ? '' : serverMessage || this.#messageFor(field);

        const error = document.getElementById(`${field.id}-error`);
        if (error) {
            error.textContent = message;
            error.hidden = valid;
        }
        field.setAttribute('aria-invalid', String(!valid));
        return valid;
    }

    #messageFor(field) {
        const messages = FIELD_MESSAGES[field.name] ?? {};
        const failed = Object.keys(messages).find(check => field.validity[check]);
        return (
            (failed && messages[failed]) || field.validationMessage || 'Please check this field.'
        );
    }

    /** Check every field; on failure, say so and move focus to the first problem. */
    #validate() {
        this.#attempted = true;
        const invalid = this.#fields().filter(field => !this.#validateField(field));
        if (invalid.length === 0) return true;

        this.#setStatus(
            invalid.length === 1
                ? 'Please fix the field below.'
                : 'Please fix the fields marked below.',
            'error'
        );
        invalid[0].focus();
        return false;
    }

    // ── Sending ─────────────────────────────────────────────────────────────────

    async #onSubmit(event) {
        event.preventDefault();
        if (this.#sending) return; // a second click or Enter while one is in flight
        this.#setStatus('', '');
        if (!this.#validate()) return;

        this.#setSending(true);
        try {
            const response = await fetch(this.#form.action, {
                method: 'POST',
                body: new FormData(this.#form),
                headers: { Accept: 'application/json' },
                signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok) this.#succeed();
            else this.#fail(result);
        } catch (error) {
            debug.warn('[ContactForm] Send failed:', error.message);
            this.#fail(null);
        } finally {
            this.#setSending(false);
        }
    }

    #succeed() {
        const email = this.#form.elements.email?.value ?? '';
        this.#form.reset();
        this.#attempted = false;
        for (const field of this.#fields()) {
            field.removeAttribute('aria-invalid');
            const error = document.getElementById(`${field.id}-error`);
            if (error) error.hidden = true;
        }
        // textContent, not markup: the address is whatever the visitor typed
        this.#setStatus(`Thanks, your message was sent. I'll reply to ${email}.`, 'success');
    }

    /**
     * @param {{ errors?: { field?: string, message?: string }[] } | null} result - Formspree's
     *   body, or null when the request never got an answer
     */
    #fail(result) {
        // Formspree can reject a particular field; show that next to the field
        const byField = (result?.errors ?? []).filter(item => item.field);
        if (byField.length > 0) {
            let first = null;
            for (const { field: name } of byField) {
                const field = this.#form.elements[name];
                if (field && !this.#validateField(field, 'This field was not accepted.')) {
                    first ??= field;
                }
            }
            if (first) {
                this.#setStatus('Please fix the field marked below.', 'error');
                first.focus();
                return;
            }
        }

        // Anything else: say so, and offer the plain way. The link is part of the status.
        const link = document.createElement('a');
        link.href = `mailto:${FALLBACK_EMAIL}`;
        link.textContent = FALLBACK_EMAIL;
        this.#status?.replaceChildren(
            "Your message couldn't be sent. Please try again, or email ",
            link,
            '.'
        );
        if (this.#status) this.#status.dataset.state = 'error';
    }

    #setSending(sending) {
        this.#sending = sending;
        // aria-disabled, not disabled: a disabled button drops keyboard focus, which would
        // leave a keyboard user stranded. The #sending guard is what stops a second submit.
        // Read-only while the request is out (disabled fields would drop out of FormData, and
        // an edit now would be thrown away by reset() on success)
        for (const field of this.#fields()) field.readOnly = sending;
        this.#button?.setAttribute('aria-busy', String(sending));
        this.#button?.setAttribute('aria-disabled', String(sending));
        if (this.#label) this.#label.textContent = sending ? 'Sending…' : 'Send message';
    }

    #setStatus(message, state) {
        if (!this.#status) return;
        this.#status.textContent = message;
        if (state) this.#status.dataset.state = state;
        else delete this.#status.dataset.state;
    }

    // ── Copy the email address ──────────────────────────────────────────────────

    #initCopyButtons() {
        for (const button of document.querySelectorAll('[data-copy]')) {
            button.addEventListener('click', () => this.#copy(button));
        }
    }

    /** The restore timer of each copy button, so a second click replaces the first one's. */
    #copyTimers = new WeakMap();

    async #copy(button) {
        const value = button.dataset.copy ?? '';
        try {
            await navigator.clipboard.writeText(value);
            // Remember the label once. Reading it on every click would capture "Copied" when the
            // button is clicked again before the first click's timer restores it.
            const label = (button.dataset.copyLabel ??= button.textContent);
            button.textContent = 'Copied';
            globalThis.appState?.managers?.ui?.showNotification?.(
                'Email address copied',
                'success',
                2500
            );
            clearTimeout(this.#copyTimers.get(button));
            this.#copyTimers.set(
                button,
                setTimeout(() => {
                    button.textContent = label;
                }, 2000)
            );
        } catch {
            // The clipboard can be refused (older app views, some browsers): select the address
            // so the visitor can copy it themselves.
            const target = button.closest('li')?.querySelector('.direct-list__value');
            if (!target) return;
            const range = document.createRange();
            range.selectNodeContents(target);
            const selection = globalThis.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
        }
    }
}

export const contactForm = new ContactForm();
