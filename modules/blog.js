/**
 * Blog Module
 *
 * Reads posts-data.json and renders a list of post cards into #blog-posts.
 * Clicking a card opens an in-page article view in #blog-article.
 * Pressing the back button (or browser Back) returns to the list.
 */

import { debug } from './debug.js';
import { escapeHtml } from './utils/html.js';

const READING_SPEED_WPM = 200;

class BlogManager {
    #posts = [];
    #listEl = null;
    #articleEl = null;

    async init() {
        this.#listEl = document.querySelector('#blog-posts');
        this.#articleEl = document.querySelector('#blog-article');

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
                    <span class="blog-reading-time"><i class="fas fa-clock" aria-hidden="true"></i> ${post.readingMinutes ?? this.#estimateMinutes(post.content)} min read</span>
                </div>
                <h3 class="blog-card-title">${escapeHtml(post.title)}</h3>
                <p class="blog-card-summary">${escapeHtml(post.summary)}</p>
                <div class="blog-card-tags">${(post.tags ?? []).map(t => `<span class="blog-tag">${escapeHtml(t)}</span>`).join('')}</div>
                <a href="#post/${escapeHtml(post.slug)}" class="blog-read-more" aria-label="Read ${escapeHtml(post.title)}">Read post <i class="fas fa-arrow-right" aria-hidden="true"></i></a>
            </article>`
            )
            .join('');

        this.#listEl.addEventListener('click', e => {
            const card = e.target.closest('[data-slug]');
            if (card) {
                e.preventDefault();
                globalThis.location.hash = `post/${card.dataset.slug}`;
            }
        });
    }

    #handleHash() {
        const { hash } = globalThis.location;
        if (hash.startsWith('#post/')) {
            const slug = decodeURIComponent(hash.slice('#post/'.length));
            const post = this.#posts.find(p => p.slug === slug);
            if (post) {
                this.#openArticle(post);
                return;
            }
        }
        this.#closeArticle();
    }

    #openArticle(post) {
        if (!this.#articleEl) return;
        this.#articleEl.hidden = false;
        this.#listEl.hidden = true;

        const mins = post.readingMinutes ?? this.#estimateMinutes(post.content);
        const tags = (post.tags ?? [])
            .map(t => `<span class="blog-tag">${escapeHtml(t)}</span>`)
            .join('');

        this.#articleEl.innerHTML = `
            <div class="blog-article-inner">
                <a href="#blog" class="blog-back-link"><i class="fas fa-arrow-left" aria-hidden="true"></i> Back to writing</a>
                <article class="blog-article-body">
                    <header class="blog-article-header">
                        <div class="blog-card-meta">
                            <time datetime="${escapeHtml(post.date)}">${this.#formatDate(post.date)}</time>
                            <span class="blog-reading-time"><i class="fas fa-clock" aria-hidden="true"></i> ${mins} min read</span>
                        </div>
                        <h1 class="blog-article-title">${escapeHtml(post.title)}</h1>
                        <div class="blog-card-tags">${tags}</div>
                    </header>
                    <div class="blog-article-content">${post.content}</div>
                </article>
            </div>`;

        this.#articleEl.querySelector('.blog-back-link')?.addEventListener('click', e => {
            e.preventDefault();
            globalThis.history.pushState(null, '', '#blog');
            this.#closeArticle();
        });

        this.#articleEl.scrollIntoView({ behavior: 'smooth' });
    }

    #closeArticle() {
        if (!this.#articleEl) return;
        this.#articleEl.hidden = true;
        this.#articleEl.innerHTML = '';
        this.#listEl.hidden = false;
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
