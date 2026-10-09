/**
 * Blog Module
 *
 * Reads posts-data.json and renders a list of post cards into #blog-posts. Each card
 * links to its generated page under /posts/<slug>/ (see scripts/generate-posts.mjs).
 * Legacy #post/<slug> links redirect there.
 */

import { debug } from './debug.js';
import { escapeHtml } from './utils/html.js';
import { icon } from './utils/icon.js';

const READING_SPEED_WPM = 200;

class BlogManager {
    #posts = [];
    #listEl = null;

    async init() {
        this.#listEl = document.querySelector('#blog-posts');

        if (!this.#listEl) return;

        try {
            const data = await this.#loadData();
            this.#posts = data?.posts ?? [];
            if (!this.#posts.length) return;

            this.#renderList();
            this.#handleHash();
            globalThis.addEventListener('hashchange', () => this.#handleHash());
            debug.log('[Blog] Initialized with', this.#posts.length, 'posts');
        } catch (err) {
            debug.warn('[Blog] Failed to load posts:', err);
        }
    }

    async #loadData() {
        const resp = await fetch('/posts-data.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    #renderList() {
        this.#listEl.innerHTML = this.#posts
            .map(
                post => `
            <article class="blog-card" data-slug="${escapeHtml(post.slug)}">
                <div class="blog-card-meta">
                    <time datetime="${escapeHtml(post.date)}" class="blog-date">${this.#formatDate(post.date)}</time>
                    <span class="blog-reading-time">${icon('clock')} ${post.readingMinutes ?? this.#estimateMinutes(post.content)} min read</span>
                </div>
                <h3 class="blog-card-title">${escapeHtml(post.title)}</h3>
                <p class="blog-card-summary">${escapeHtml(post.summary)}</p>
                <div class="blog-card-tags">${(post.tags ?? []).map(t => `<span class="blog-tag">${escapeHtml(t)}</span>`).join('')}</div>
                <a href="/posts/${encodeURIComponent(post.slug)}/" class="blog-read-more" aria-label="Read ${escapeHtml(post.title)}">Read post ${icon('arrow-right')}</a>
            </article>`
            )
            .join('');

        // Whole card is clickable; the "Read post" link handles keyboard and middle-click
        this.#listEl.addEventListener('click', e => {
            if (e.target.closest('a')) return;
            const card = e.target.closest('[data-slug]');
            if (card)
                globalThis.location.assign(`/posts/${encodeURIComponent(card.dataset.slug)}/`);
        });
    }

    // Old shared links used #post/<slug>; send them to the real page.
    #handleHash() {
        const { hash } = globalThis.location;
        if (!hash.startsWith('#post/')) return;
        const slug = decodeURIComponent(hash.slice('#post/'.length));
        if (this.#posts.some(p => p.slug === slug)) {
            globalThis.location.replace(`/posts/${encodeURIComponent(slug)}/`);
        }
    }

    #formatDate(dateStr) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    }

    #estimateMinutes(html) {
        const words = (html ?? '')
            .replace(/<[^>]*>/g, ' ')
            .trim()
            .split(/\s+/).length;
        return Math.max(1, Math.round(words / READING_SPEED_WPM));
    }
}

export const blogManager = new BlogManager();
