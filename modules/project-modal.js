/**
 * Project Case-Study Modal
 * An accessible, deep-linkable modal that presents a long-form "case study"
 * view for a project. Content is built entirely from real project metadata and
 * live GitHub stats — nothing is fabricated.
 *
 * Deep-linking: opening a study sets the URL hash to `#project/<slug>`, so a
 * study can be shared/bookmarked and restored on load. Closing restores the
 * previous hash.
 */

import { debug } from './debug.js';
import { WORKER_BASE } from './config.js';

/** Worker endpoint for OG image generation. */
const OG_WORKER_URL = `${WORKER_BASE}/og`;

/** The og:image meta value set at page load (restored on modal close). */
let defaultOgImage = '';

export class ProjectModal {
    registry = new Map();
    modal = null;
    dialog = null;
    bodyEl = null;
    titleEl = null;
    isOpen = false;
    currentSlug = null;
    lastFocused = null;
    previousHash = '';

    init() {
        if (this.modal) return; // idempotent

        const modal = document.createElement('div');
        modal.className = 'project-modal';
        modal.id = 'project-modal';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="project-modal-backdrop" data-modal-close></div>
            <div class="project-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
                <button class="project-modal-close" type="button" aria-label="Close case study" data-modal-close>
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
                <div class="project-modal-body" id="project-modal-body"></div>
            </div>
        `;
        document.body.appendChild(modal);

        this.modal = modal;
        this.dialog = modal.querySelector('.project-modal-dialog');
        this.bodyEl = modal.querySelector('.project-modal-body');

        for (const el of modal.querySelectorAll('[data-modal-close]')) {
            el.addEventListener('click', () => this.close());
        }

        document.addEventListener('keydown', e => {
            if (this.isOpen && e.key === 'Escape') {
                e.preventDefault();
                this.close();
            }
        });

        globalThis.addEventListener('hashchange', () => this.handleHash());

        // Restore a deep-linked study on first load (after registration).
        this.handleHash();

        // Cache the initial og:image so we can restore it on close.
        defaultOgImage =
            document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';

        debug.log('[ProjectModal] Initialized');
    }

    /**
     * Register a project's normalized data for the modal.
     * @param {string} slug
     * @param {object} data
     */
    register(slug, data) {
        if (!slug) return;
        this.registry.set(slug, data);
        // If the page loaded pointing at this study, open it now that data exists.
        if (!this.isOpen && this._slugFromHash() === slug) {
            this.open(slug, { updateHash: false });
        }
    }

    _slugFromHash() {
        const { hash } = globalThis.location;
        return hash.startsWith('#project/')
            ? decodeURIComponent(hash.slice('#project/'.length))
            : null;
    }

    handleHash() {
        const slug = this._slugFromHash();
        if (slug && this.registry.has(slug)) {
            if (!this.isOpen || this.currentSlug !== slug) {
                this.open(slug, { updateHash: false });
            }
        } else if (this.isOpen) {
            this.close({ updateHash: false });
        }
    }

    open(slug, { updateHash = true } = {}) {
        const data = this.registry.get(slug);
        if (!data || !this.modal) return;

        if (updateHash) {
            this.previousHash = globalThis.location.hash || '';
            globalThis.location.hash = `project/${encodeURIComponent(slug)}`;
        }

        this.lastFocused = document.activeElement;
        this.currentSlug = slug;
        this.bodyEl.innerHTML = this.renderBody(data);
        this.titleEl = this.bodyEl.querySelector('#project-modal-title');

        this.isOpen = true;
        this.modal.classList.add('visible');
        this.modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-open');
        document.addEventListener('keydown', this.trapFocus);

        // Update og:image so apps that check at paste-time see the project card.
        document
            .querySelector('meta[property="og:image"]')
            ?.setAttribute('content', `${OG_WORKER_URL}?project=${encodeURIComponent(slug)}`);

        requestAnimationFrame(() => {
            const closeBtn = this.modal.querySelector('.project-modal-close');
            closeBtn?.focus();
        });
    }

    close({ updateHash = true } = {}) {
        if (!this.isOpen) return;
        this.isOpen = false;
        this.currentSlug = null;
        this.modal.classList.remove('visible');
        this.modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('modal-open');
        document.removeEventListener('keydown', this.trapFocus);

        if (updateHash && this._slugFromHash()) {
            const restore =
                this.previousHash && !this.previousHash.startsWith('#project/')
                    ? this.previousHash
                    : '#projects';
            globalThis.history.replaceState(null, '', restore);
        }

        if (this.lastFocused instanceof HTMLElement) {
            this.lastFocused.focus();
        }

        // Restore default og:image.
        if (defaultOgImage) {
            document
                .querySelector('meta[property="og:image"]')
                ?.setAttribute('content', defaultOgImage);
        }
    }

    trapFocus = e => {
        if (e.key !== 'Tab') return;
        const focusable = this.dialog.querySelectorAll(
            'button, input, [href], [tabindex]:not([tabindex="-1"])'
        );
        const list = Array.from(focusable).filter(el => el.offsetParent !== null);
        if (list.length === 0) return;
        const first = list[0];
        const last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    renderBody(d) {
        const stat = (icon, value, label) =>
            value === null || value === undefined
                ? ''
                : `<div class="project-modal-stat" title="${label}">
                    <i class="fas fa-${icon}" aria-hidden="true"></i>
                    <span class="project-modal-stat-value">${value}</span>
                    <span class="project-modal-stat-label">${label}</span>
                </div>`;

        const techTags = (d.technologies ?? [])
            .map(t => `<span class="language-tag">${t}</span>`)
            .join('');

        const highlights = (d.highlights ?? []).map(h => `<li>${h}</li>`).join('');

        // Optional curated impact metrics from projects-data.json:
        // "metrics": [{ "value": "30 fps", "label": "LiDAR depth stream" }, …]
        const metrics = (d.metrics ?? [])
            .filter(m => m?.value && m?.label)
            .map(
                m => `<div class="project-modal-metric">
                    <span class="project-modal-metric-value">${m.value}</span>
                    <span class="project-modal-metric-label">${m.label}</span>
                </div>`
            )
            .join('');

        const liveLink = d.homepage
            ? `<a href="${d.homepage}" target="_blank" rel="noopener noreferrer" class="project-link live">
                    <i class="fas fa-external-link-alt" aria-hidden="true"></i> Live Demo
                </a>`
            : '';

        return `
            <header class="project-modal-header">
                <div class="project-modal-badges">
                    ${d.category ? `<span class="project-category">${d.category}</span>` : ''}
                    ${d.status ? `<span class="status-badge ${d.status.toLowerCase().replaceAll(/\s+/g, '-')}">${d.status}</span>` : ''}
                </div>
                <h2 class="project-modal-title" id="project-modal-title">${d.displayName}</h2>
                <p class="project-modal-tagline">${d.description}</p>
            </header>

            <div class="project-modal-stats">
                ${stat('star', d.stars, 'Stars')}
                ${stat('code-branch', d.forks, 'Forks')}
                ${stat('circle-dot', d.openIssues, 'Open issues')}
                ${stat('code', d.language, 'Primary language')}
                ${d.pushedRelative ? stat('code-commit', d.pushedRelative, 'Last pushed') : ''}
            </div>

            ${
                d.longDescription
                    ? `
                <section class="project-modal-section">
                    <h3>Overview</h3>
                    <p>${d.longDescription}</p>
                </section>`
                    : ''
            }

            ${
                metrics
                    ? `
                <section class="project-modal-section">
                    <h3>By the numbers</h3>
                    <div class="project-modal-metrics">${metrics}</div>
                </section>`
                    : ''
            }

            ${
                highlights
                    ? `
                <section class="project-modal-section">
                    <h3>Highlights</h3>
                    <ul class="project-modal-highlights">${highlights}</ul>
                </section>`
                    : ''
            }

            ${
                techTags
                    ? `
                <section class="project-modal-section">
                    <h3>Tech stack</h3>
                    <div class="project-modal-tech">${techTags}</div>
                </section>`
                    : ''
            }

            <footer class="project-modal-links">
                <a href="${d.htmlUrl}" target="_blank" rel="noopener noreferrer" class="project-link">
                    <i class="fab fa-github" aria-hidden="true"></i> View Code
                </a>
                ${liveLink}
            </footer>
        `;
    }
}

export const projectModal = new ProjectModal();
export default projectModal;
