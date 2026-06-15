/**
 * Command Palette
 *
 * Brings the existing #global-search-modal markup to life as a full
 * Cmd/Ctrl-K command palette: fuzzy search across projects, skills, sections
 * and quick actions (toggle theme, copy email, download résumé, open socials).
 *
 * Keyboard: Cmd/Ctrl-K or "/" opens · ↑/↓ navigate · Enter runs · Esc closes.
 * Implements a focus trap and restores focus to the previously-active element.
 *
 * @author Matthew Anderson
 */

import { debug } from './debug.js';

const EMAIL = 'contact@matthewanderson.dev';
const GITHUB = 'https://github.com/and3rn3t';

class CommandPalette {
    constructor() {
        this.modal = document.getElementById('global-search-modal');
        this.input = document.getElementById('global-search-input');
        this.resultsContent = document.getElementById('search-results-content');
        this.emptyState = document.getElementById('search-results-empty');
        this.closeBtn = document.getElementById('global-search-close');
        this.categoryBtns = Array.from(document.querySelectorAll('.search-category'));

        this.items = [];
        this.filtered = [];
        this.activeIndex = 0;
        this.activeCategory = 'all';
        this.lastFocused = null;
        this.isOpen = false;
    }

    init() {
        if (!this.modal || !this.input || !this.resultsContent) {
            debug.warn('[Palette] Modal markup missing; skipping.');
            return;
        }

        this.buildItems();

        // Global open shortcut.
        document.addEventListener('keydown', e => {
            const key = e.key.toLowerCase();
            if ((e.metaKey || e.ctrlKey) && key === 'k') {
                e.preventDefault();
                this.toggle();
                return;
            }
            // "/" opens when not typing in a field.
            if (
                key === '/' &&
                !this.isOpen &&
                !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || '')
            ) {
                e.preventDefault();
                this.open();
            }
        });

        this.input.addEventListener('input', () => this.render());
        this.input.addEventListener('keydown', e => this.onInputKeydown(e));

        this.closeBtn?.addEventListener('click', () => this.close());
        this.modal.addEventListener('click', e => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        for (const btn of this.categoryBtns) {
            btn.addEventListener('click', () => {
                this.activeCategory = btn.dataset.category || 'all';
                for (const b of this.categoryBtns) {
                    b.classList.toggle('active', b === btn);
                }
                this.render();
                this.input.focus();
            });
        }

        debug.log('[Palette] Initialized with', this.items.length, 'items');
    }

    /** Build the searchable command/content index. */
    buildItems() {
        const actions = [
            {
                type: 'action',
                category: 'all',
                icon: 'fa-moon',
                title: 'Toggle theme',
                subtitle: 'Switch between light and dark',
                run: () => globalThis.appState?.managers?.theme?.toggle(),
            },
            {
                type: 'action',
                category: 'all',
                icon: 'fa-envelope',
                title: 'Copy email address',
                subtitle: EMAIL,
                run: async () => {
                    try {
                        await navigator.clipboard.writeText(EMAIL);
                        this.flash('Email copied to clipboard');
                    } catch {
                        globalThis.location.href = `mailto:${EMAIL}`;
                    }
                },
            },
            {
                type: 'action',
                category: 'all',
                icon: 'fa-file-pdf',
                title: 'Download résumé',
                subtitle: 'Open resume.pdf',
                run: () => globalThis.open('/resume.pdf', '_blank', 'noopener'),
            },
            {
                type: 'action',
                category: 'all',
                icon: 'fa-github',
                brand: true,
                title: 'Open GitHub profile',
                subtitle: GITHUB,
                run: () => globalThis.open(GITHUB, '_blank', 'noopener'),
            },
            {
                type: 'action',
                category: 'all',
                icon: 'fa-linkedin',
                brand: true,
                title: 'Open LinkedIn',
                subtitle: 'linkedin.com/in/matthew-anderson',
                run: () =>
                    globalThis.open(
                        'https://linkedin.com/in/matthew-anderson',
                        '_blank',
                        'noopener'
                    ),
            },
        ];

        // Sections as jump targets.
        const sections = Array.from(document.querySelectorAll('section[id]')).map(section => {
            const heading = section.querySelector('.section-title, h1, h2');
            const label = heading?.textContent?.trim() || section.id;
            return {
                type: 'content',
                category: 'content',
                icon: 'fa-arrow-right',
                title: `Go to ${label}`,
                subtitle: `#${section.id}`,
                run: () => {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
            };
        });

        // Skills from the DOM.
        const skills = Array.from(document.querySelectorAll('.skill-item')).map(el => {
            const name = el.textContent.trim();
            return {
                type: 'skill',
                category: 'skills',
                icon: 'fa-cog',
                title: name,
                subtitle: 'Skill',
                run: () => {
                    document
                        .getElementById('skills')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                },
            };
        });

        this.items = [...actions, ...sections, ...skills];

        // Projects are loaded async; fetch the static data for richer entries.
        this.loadProjects();
    }

    async loadProjects() {
        try {
            const res = await fetch('/projects-data.json');
            if (!res.ok) {
                return;
            }
            const data = await res.json();
            const projects = (data.projects || []).map(p => ({
                type: 'project',
                category: 'projects',
                icon: 'fa-code',
                title: p.displayName || p.name,
                subtitle: (p.technologies || []).slice(0, 3).join(' · ') || p.description,
                keywords: [p.name, ...(p.technologies || [])].join(' ').toLowerCase(),
                run: () => {
                    const url = p.github_repo ? `https://github.com/${p.github_repo}` : `${GITHUB}`;
                    globalThis.open(url, '_blank', 'noopener');
                },
            }));
            this.items = [...this.items, ...projects];
            if (this.isOpen) {
                this.render();
            }
        } catch (err) {
            debug.warn('[Palette] Could not load projects:', err);
        }
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        if (this.isOpen) {
            return;
        }
        this.lastFocused = document.activeElement;
        this.isOpen = true;
        this.modal.classList.add('visible');
        this.modal.setAttribute('aria-hidden', 'false');
        this.input.value = '';
        this.activeIndex = 0;
        this.render();
        // Focus after the open transition begins.
        requestAnimationFrame(() => this.input.focus());
        document.addEventListener('keydown', this.trapFocus);
    }

    close() {
        if (!this.isOpen) {
            return;
        }
        this.isOpen = false;
        this.modal.classList.remove('visible');
        this.modal.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', this.trapFocus);
        if (this.lastFocused instanceof HTMLElement) {
            this.lastFocused.focus();
        }
    }

    /** Bound focus-trap handler. */
    trapFocus = e => {
        if (e.key !== 'Tab') {
            return;
        }
        const focusable = this.modal.querySelectorAll(
            'button, input, [href], [tabindex]:not([tabindex="-1"])'
        );
        const list = Array.from(focusable).filter(el => el.offsetParent !== null);
        if (list.length === 0) {
            return;
        }
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

    onInputKeydown(e) {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.move(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.move(-1);
                break;
            case 'Enter':
                e.preventDefault();
                this.runActive();
                break;
            case 'Escape':
                e.preventDefault();
                this.close();
                break;
        }
    }

    move(delta) {
        if (this.filtered.length === 0) {
            return;
        }
        this.activeIndex = (this.activeIndex + delta + this.filtered.length) % this.filtered.length;
        this.highlightActive();
    }

    runActive() {
        const item = this.filtered[this.activeIndex];
        if (!item) {
            return;
        }
        const keepOpen = item.type === 'action' && /toggle theme/i.test(item.title);
        item.run?.();
        if (!keepOpen) {
            this.close();
        }
    }

    /** Subsequence fuzzy score; higher is better, -1 = no match. */
    score(query, item) {
        const haystack =
            `${item.title} ${item.subtitle || ''} ${item.keywords || ''}`.toLowerCase();
        const q = query.toLowerCase().trim();
        if (q === '') {
            return 0;
        }
        let qi = 0;
        let consecutive = 0;
        let total = 0;
        for (let i = 0; i < haystack.length && qi < q.length; i++) {
            if (haystack[i] === q[qi]) {
                qi++;
                consecutive++;
                total += consecutive;
            } else {
                consecutive = 0;
            }
        }
        return qi === q.length ? total : -1;
    }

    render() {
        const query = this.input.value;
        const pool = this.items.filter(
            it => this.activeCategory === 'all' || it.category === this.activeCategory
        );

        this.filtered = pool
            .map(it => ({ it, s: this.score(query, it) }))
            .filter(x => x.s >= 0)
            .sort((a, b) => b.s - a.s)
            .map(x => x.it)
            .slice(0, 30);

        this.activeIndex = 0;

        if (this.emptyState) {
            this.emptyState.style.display =
                query.trim() === '' && this.activeCategory === 'all' ? '' : 'none';
        }

        if (this.filtered.length === 0) {
            this.resultsContent.innerHTML =
                query.trim() === '' ? '' : '<div class="palette-no-results">No matches found</div>';
            return;
        }

        this.resultsContent.innerHTML = this.filtered
            .map((item, i) => {
                const iconClass = item.brand ? 'fab' : 'fas';
                return `
                <button class="palette-item${i === 0 ? ' is-active' : ''}" data-index="${i}" type="button">
                    <span class="palette-item-icon"><i class="${iconClass} ${item.icon}"></i></span>
                    <span class="palette-item-text">
                        <span class="palette-item-title">${escapeHtml(item.title)}</span>
                        ${item.subtitle ? `<span class="palette-item-subtitle">${escapeHtml(item.subtitle)}</span>` : ''}
                    </span>
                    <span class="palette-item-type">${item.type}</span>
                </button>`;
            })
            .join('');

        for (const btn of this.resultsContent.querySelectorAll('.palette-item')) {
            btn.addEventListener('click', () => {
                this.activeIndex = Number(btn.dataset.index);
                this.runActive();
            });
            btn.addEventListener('pointermove', () => {
                this.activeIndex = Number(btn.dataset.index);
                this.highlightActive();
            });
        }
    }

    highlightActive() {
        const items = this.resultsContent.querySelectorAll('.palette-item');
        items.forEach((el, i) => {
            const active = i === this.activeIndex;
            el.classList.toggle('is-active', active);
            if (active) {
                el.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    flash(message) {
        let toast = document.getElementById('palette-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'palette-toast';
            toast.className = 'palette-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => toast.classList.remove('visible'), 2000);
    }
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

export const commandPalette = new CommandPalette();
export default commandPalette;
