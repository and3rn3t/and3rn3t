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
// Replace with your actual sitekey after creating a Turnstile site.
const TURNSTILE_SITEKEY = 'REPLACE_WITH_TURNSTILE_SITEKEY';

class GuestbookManager {
    #form = null;
    #entriesEl = null;
    #statusEl = null;
    #token = '';

    async init() {
        this.#form = document.querySelector('#guestbook-form');
        this.#entriesEl = document.querySelector('#guestbook-entries');
        this.#statusEl = document.querySelector('#guestbook-status');

        if (!this.#form || !this.#entriesEl) return;

        await this.#loadEntries();
        this.#initTurnstile();
        this.#form.addEventListener('submit', e => this.#handleSubmit(e));
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
        script.addEventListener('load', () => {
            if (!globalThis.turnstile) return;
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
            });
        });
        document.head.appendChild(script);
    }

    async #handleSubmit(e) {
        e.preventDefault();
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
            const result = await resp.json();
            if (resp.ok && result.ok) {
                this.#setStatus('Thanks! Your message was added.', 'success');
                this.#form.reset();
                this.#token = '';
                globalThis.turnstile?.reset?.('#turnstile-container');
                // Prepend new entry to the list without a full reload.
                const { entry } = result;
                const newEl = document.createElement('article');
                newEl.className = 'guestbook-entry guestbook-entry--new';
                newEl.innerHTML = `
                    <header class="guestbook-entry-header">
                        <strong class="guestbook-name">${escapeHtml(entry.name)}</strong>
                        <time class="guestbook-date">${this.#formatDate(entry.date)}</time>
                    </header>
                    <p class="guestbook-message">${escapeHtml(entry.message)}</p>`;
                this.#entriesEl.prepend(newEl);
                const emptyMsg = this.#entriesEl.querySelector('.guestbook-empty');
                emptyMsg?.remove();
            } else {
                this.#setStatus(
                    result.error === 'invalid_captcha'
                        ? 'Captcha verification failed — please try again.'
                        : 'Something went wrong. Please try again.',
                    'error'
                );
            }
        } catch {
            this.#setStatus('Network error. Please try again.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
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
