/**
 * Contact Tabs Module
 *
 * ARIA tabs inside #contact: "Send a message" (Formspree form) and "Sign the
 * guestbook". The guestbook module — and with it the Turnstile script — only
 * loads the first time its tab opens. Old `#guestbook` links open that tab.
 */

import { debug } from './debug.js';

class ContactTabs {
    #tabs = [];
    #guestbookLoaded = false;

    init() {
        const tablist = document.querySelector('#contact [role="tablist"]');
        if (!tablist) return;

        this.#tabs = [...tablist.querySelectorAll('[role="tab"]')];

        for (const tab of this.#tabs) {
            tab.addEventListener('click', () => this.select(tab));
        }

        // Roving tabindex: arrows move between tabs, Home/End jump to the ends.
        tablist.addEventListener('keydown', e => {
            const index = this.#tabs.indexOf(document.activeElement);
            if (index === -1) return;
            const last = this.#tabs.length - 1;
            const next = {
                ArrowRight: index === last ? 0 : index + 1,
                ArrowLeft: index === 0 ? last : index - 1,
                Home: 0,
                End: last,
            }[e.key];
            if (next === undefined) return;
            e.preventDefault();
            this.select(this.#tabs[next]);
            this.#tabs[next].focus();
        });

        globalThis.addEventListener('hashchange', () => this.#handleHash());
        this.#handleHash();

        debug.log('[ContactTabs] Initialized');
    }

    select(tab) {
        for (const t of this.#tabs) {
            const selected = t === tab;
            t.setAttribute('aria-selected', String(selected));
            t.tabIndex = selected ? 0 : -1;
            const panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) panel.hidden = !selected;
        }

        if (tab.id === 'contact-tab-guestbook') void this.#loadGuestbook();
    }

    #handleHash() {
        if (globalThis.location.hash !== '#guestbook') return;
        const tab = this.#tabs.find(t => t.id === 'contact-tab-guestbook');
        if (!tab) return;
        this.select(tab);
        document.getElementById('contact')?.scrollIntoView({ block: 'start' });
    }

    async #loadGuestbook() {
        if (this.#guestbookLoaded) return;
        this.#guestbookLoaded = true;
        try {
            const { guestbookManager } = await import('./guestbook.js');
            await guestbookManager.init();
            if (globalThis.appState?.managers) {
                globalThis.appState.managers.guestbook = guestbookManager;
            }
        } catch (err) {
            this.#guestbookLoaded = false;
            debug.warn('[ContactTabs] Guestbook failed to load:', err);
        }
    }
}

export const contactTabs = new ContactTabs();
