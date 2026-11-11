/**
 * Guestbook Module
 *
 * Fetches entries from the Worker GET /guestbook and renders them into
 * #guestbook-entries. The submission form POSTs to Worker POST /guestbook
 * with a Cloudflare Turnstile token for spam prevention.
 *
 * The Turnstile widget is rendered into #turnstile-container.
 * Turnstile sitekey is public and safe to embed here.
 */

import { debug } from './debug.js';
import { WORKER_BASE } from './config.js';
import { escapeHtml } from './utils/html.js';

// Public sitekey — safe to commit. Get from dash.cloudflare.com → Turnstile.
const TURNSTILE_SITEKEY = '0x4AAAAAAFNonLuoeiwThp5v';

// What the Worker's error codes mean to a visitor; anything else gets the generic message.
const SUBMIT_ERRORS = {
    invalid_captcha: 'Captcha verification failed — please try again.',
    rate_limited: 'Please wait a minute before signing again.',
    captcha_unconfigured: 'The guestbook is temporarily unavailable. Please try again later.',
};
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const CAPTCHA_BLOCKED =
    "The captcha couldn't load (an ad blocker may be blocking it). Use the message form instead.";

class GuestbookManager {
    #form = null;
    #entriesEl = null;
    #statusEl = null;
    #token = '';
    #widgetId = null;
    #captchaBlocked = false;

    async init() {
        this.#form = document.querySelector('#guestbook-form');
        this.#entriesEl = document.querySelector('#guestbook-entries');
        this.#statusEl = document.querySelector('#guestbook-status');

        if (!this.#form || !this.#entriesEl) return;

        // The submit button ships disabled so the form can't fall back to a
        // native GET (reloading the page with the message in the URL) before
        // this handler exists. Wire it first, then do the network work.
        this.#form.addEventListener('submit', e => this.#handleSubmit(e));
        const submitBtn = this.#form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = false;

        this.#initTurnstile();
        await this.#loadEntries();
        debug.log('[Guestbook] Initialized');
    }

    async #loadEntries() {
        try {
            const resp = await fetch(`${WORKER_BASE}/guestbook`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const entries = await resp.json();
            this.#renderEntries(entries);
        } catch (err) {
            debug.warn('[Guestbook] Load failed:', err.message);
            this.#entriesEl.innerHTML = '<p class="guestbook-error">Could not load entries.</p>';
        }
    }

    #renderEntries(entries) {
        if (!entries.length) {
            this.#entriesEl.innerHTML =
                '<p class="guestbook-empty">No entries yet — be the first!</p>';
            return;
        }
        this.#entriesEl.innerHTML = entries
            .map(
                e => `
            <article class="guestbook-entry">
                <header class="guestbook-entry-header">
                    <strong class="guestbook-name">${escapeHtml(e.name)}</strong>
                    <time class="guestbook-date" datetime="${escapeHtml(e.date)}">${this.#formatDate(e.date)}</time>
                </header>
                <p class="guestbook-message">${escapeHtml(e.message)}</p>
            </article>`
            )
            .join('');
    }

    #initTurnstile() {
        const container = document.querySelector('#turnstile-container');
        if (!container) return;

        // Load Turnstile script lazily.
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.addEventListener('load', () => this.#renderWidget());
        // Blocked by an ad/tracker blocker or the network: say so instead of leaving a
        // form that can never be completed and only asks for a captcha that isn't there.
        script.addEventListener('error', () => this.#blockSubmitting());
        document.head.appendChild(script);

        // The widget's theme is fixed when it is rendered, so draw it again on a switch.
        document.addEventListener('themeChanged', () => this.#renderWidget());
    }

    /** The captcha can't load, so the form can't be completed: say so and stop offering it. */
    #blockSubmitting() {
        this.#captchaBlocked = true;
        const btn = this.#form?.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;
        this.#setStatus(CAPTCHA_BLOCKED, 'error');
    }

    #renderWidget() {
        const container = document.querySelector('#turnstile-container');
        if (!container || !globalThis.turnstile) return;

        if (this.#widgetId !== null) globalThis.turnstile.remove?.(this.#widgetId);
        this.#token = '';
        this.#widgetId =
            globalThis.turnstile.render('#turnstile-container', {
                sitekey: TURNSTILE_SITEKEY,
                callback: token => {
                    this.#token = token;
                },
                'expired-callback': () => {
                    this.#token = '';
                },
                'error-callback': () => {
                    this.#token = '';
                },
                theme: document.body.classList.contains('dark-theme') ? 'dark' : 'light',
                // The normal widget is a fixed 300px; use compact on very narrow screens.
                size: container.clientWidth < 300 ? 'compact' : 'normal',
            }) ?? null;
    }

    /** A Turnstile token works once, so after any submit attempt the visitor needs a new one. */
    #resetCaptcha() {
        this.#token = '';
        globalThis.turnstile?.reset?.(this.#widgetId ?? '#turnstile-container');
    }

    async #handleSubmit(e) {
        e.preventDefault();
        // Keep the explanation on screen instead of asking for a captcha that can't appear.
        if (this.#captchaBlocked) return;
        const data = new FormData(this.#form);
        const nameVal = data.get('name');
        const messageVal = data.get('message');
        const name = (typeof nameVal === 'string' ? nameVal : '').trim();
        const message = (typeof messageVal === 'string' ? messageVal : '').trim();

        if (!name || !message) return;
        if (!this.#token) {
            this.#setStatus('Please complete the captcha.', 'error');
            return;
        }

        const btn = this.#form.querySelector('button[type="submit"]');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending…';
        }
        this.#setStatus('', '');

        try {
            const resp = await fetch(`${WORKER_BASE}/guestbook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, message, token: this.#token }),
                signal: AbortSignal.timeout(8000),
            });
            const result = await resp.json().catch(() => ({}));
            if (resp.ok && result.ok) {
                this.#setStatus('Thanks! Your message was added.', 'success');
                this.#form.reset();
                this.#resetCaptcha();
                // Prepend new entry to the list without a full reload.
                const { entry } = result;
                const newEl = document.createElement('article');
                newEl.className = 'guestbook-entry guestbook-entry--new';
                newEl.innerHTML = `
                    <header class="guestbook-entry-header">
                        <strong class="guestbook-name">${escapeHtml(entry.name)}</strong>
                        <time class="guestbook-date" datetime="${escapeHtml(entry.date)}">${this.#formatDate(entry.date)}</time>
                    </header>
                    <p class="guestbook-message">${escapeHtml(entry.message)}</p>`;
                this.#entriesEl.prepend(newEl);
                const emptyMsg = this.#entriesEl.querySelector('.guestbook-empty');
                emptyMsg?.remove();
            } else {
                this.#resetCaptcha();
                this.#setStatus(SUBMIT_ERRORS[result.error] ?? GENERIC_ERROR, 'error');
            }
        } catch {
            this.#resetCaptcha();
            this.#setStatus('Network error. Please try again.', 'error');
        } finally {
            if (btn) {
                btn.disabled = this.#captchaBlocked;
                btn.textContent = 'Sign guestbook';
            }
        }
    }

    #setStatus(msg, type) {
        if (!this.#statusEl) return;
        this.#statusEl.textContent = msg;
        const cls = type ? `guestbook-status guestbook-status--${type}` : 'guestbook-status';
        this.#statusEl.className = cls;
    }

    #formatDate(iso) {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }
}

export const guestbookManager = new GuestbookManager();
