/**
 * Blog Module
 *
 * The writing rows are pre-rendered into index.html by scripts/generate-site.mjs and each
 * links to its generated page under /posts/<slug>/. The whole row is that link (a stretched
 * link in CSS), so nothing here is needed for it to work. This module only redirects legacy
 * #post/<slug> links to the real pages.
 */

import { debug } from './debug.js';

class BlogManager {
    #listEl = null;

    init() {
        this.#listEl = document.querySelector('#blog-posts');
        if (!this.#listEl) return;

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
