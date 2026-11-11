/**
 * Blog Module
 *
 * The writing cards are pre-rendered into index.html by scripts/generate-site.mjs and each
 * links to its generated page under /posts/<slug>/. This module makes the whole card
 * clickable and redirects legacy #post/<slug> links.
 */

import { debug } from './debug.js';

class BlogManager {
    #listEl = null;

    init() {
        this.#listEl = document.querySelector('#blog-posts');
        if (!this.#listEl) return;

        // Whole card is clickable; the "Read post" link handles keyboard and middle-click
        this.#listEl.addEventListener('click', e => {
            if (e.target.closest('a')) return;
            const card = e.target.closest('[data-slug]');
            if (card) {
                globalThis.location.assign(`/posts/${encodeURIComponent(card.dataset.slug)}/`);
            }
        });

        this.#handleHash();
        globalThis.addEventListener('hashchange', () => this.#handleHash());
        debug.log('[Blog] Initialized');
    }

    // Old shared links used #post/<slug>; send them to the real page.
    #handleHash() {
        const { hash } = globalThis.location;
        if (!hash.startsWith('#post/')) return;
        const slug = decodeURIComponent(hash.slice('#post/'.length));
        if (this.#listEl.querySelector(`[data-slug="${CSS.escape(slug)}"]`)) {
            globalThis.location.replace(`/posts/${encodeURIComponent(slug)}/`);
        }
    }
}

export const blogManager = new BlogManager();
