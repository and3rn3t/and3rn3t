/**
 * Command Palette
 *
 * Brings the #global-search-modal <dialog> to life as a full Cmd/Ctrl-K command
 * palette: fuzzy search across projects, posts, skills, sections and quick actions
 * (toggle theme, copy email, download résumé, open socials).
 *
 * Keyboard: Cmd/Ctrl-K or "/" opens · ↑/↓ navigate · Enter runs · Esc closes.
 * The browser does the rest: showModal() traps focus in the dialog, makes the page
 * behind it inert, closes on Esc and puts focus back where it was.
 *
 * @author Matthew Anderson
 */

import { debug } from './debug.js';
import { loadJSON } from './utils/data.js';
import { projectView } from './utils/projects.js';
import { escapeHtml } from './utils/html.js';
import { icon } from './utils/icon.js';

const optionId = index => `palette-option-${index}`;

const EMAIL = 'and3rn3t@icloud.com';
const GITHUB = 'https://github.com/and3rn3t';

class CommandPalette {
    constructor() {
        this.modal = document.getElementById('global-search-modal');
        this.input = document.getElementById('global-search-input');
        this.resultsContent = document.getElementById('search-results-content');
        this.emptyState = document.getElementById('search-results-empty');
        this.statusEl = document.getElementById('search-results-status');
        this.closeBtn = document.getElementById('global-search-close');
        this.categoryBtns = Array.from(document.querySelectorAll('.search-category'));

        this.items = [];
        this.filtered = [];
        this.activeIndex = 0;
        this.activeCategory = 'all';
    }

    get isOpen() {
        return Boolean(this.modal?.open);
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

        // Visible triggers (the nav's search button), with the shortcut shown for this platform
        const shortcut = /Mac|iPhone|iPad/i.test(globalThis.navigator?.platform ?? '')
            ? '⌘K'
            : 'Ctrl K';
        for (const trigger of document.querySelectorAll('[data-open-palette]')) {
            trigger.addEventListener('click', () => this.open());
            for (const hint of trigger.querySelectorAll('kbd')) hint.textContent = shortcut;
        }

        this.input.addEventListener('input', () => this.render());
        this.input.addEventListener('keydown', e => this.onInputKeydown(e));

        this.closeBtn?.addEventListener('click', () => this.close());
        this.modal.addEventListener('close', this.onClosed);
        // The dialog has no padding and its content fills it, so a click that lands on the
        // dialog itself is a click on the backdrop.
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
                    b.setAttribute('aria-pressed', String(b === btn));
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
                icon: 'moon',
                title: 'Toggle theme',
                subtitle: 'Switch between light and dark',
                run: () => globalThis.appState?.managers?.theme?.toggle(),
            },
            {
                type: 'action',
                category: 'all',
                icon: 'envelope',
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
                icon: 'file-pdf',
                title: 'Download résumé',
                subtitle: 'Open resume.pdf',
                run: () => globalThis.open('/resume.pdf', '_blank', 'noopener'),
            },
            {
                type: 'action',
                category: 'all',
                icon: 'github',
                title: 'Open GitHub profile',
                subtitle: GITHUB,
                run: () => globalThis.open(GITHUB, '_blank', 'noopener'),
            },
            {
                type: 'action',
                category: 'all',
                icon: 'linkedin',
                title: 'Open LinkedIn',
                subtitle: 'linkedin.com/in/and3rn3t',
                run: () =>
                    globalThis.open('https://linkedin.com/in/and3rn3t', '_blank', 'noopener'),
            },
        ];

        // Sections as jump targets.
        const sections = Array.from(document.querySelectorAll('section[id]')).map(section => {
            const heading = section.querySelector('.section-title, h1, h2');
            const label = heading?.textContent?.trim() || section.id;
            return {
                type: 'content',
                category: 'content',
                icon: 'arrow-right',
                title: `Go to ${label}`,
                subtitle: `#${section.id}`,
                run: () => this.goToSection(section),
            };
        });

        // Posts: the rows in the Writing section are the posts there are
        const posts = Array.from(document.querySelectorAll('#blog-posts [data-slug]')).map(row => ({
            type: 'post',
            category: 'content',
            icon: 'file-alt',
            title: row.querySelector('a')?.textContent?.trim() || row.dataset.slug,
            subtitle: row.querySelector('time')?.textContent?.trim() || 'Post',
            keywords: 'post writing blog article',
            run: () =>
                globalThis.location.assign(`/posts/${encodeURIComponent(row.dataset.slug)}/`),
        }));

        // Skills from the DOM.
        const skills = Array.from(document.querySelectorAll('.tech-chip')).map(el => {
            const name = el.textContent.trim();
            return {
                type: 'skill',
                category: 'skills',
                icon: 'cog',
                title: name,
                subtitle: 'Skill',
                run: () => this.goToSection(document.getElementById('about')),
            };
        });

        this.items = [...actions, ...sections, ...posts, ...skills];

        // Projects are loaded async; fetch the static data for richer entries.
        this.loadProjects();
    }

    async loadProjects() {
        try {
            const data = await loadJSON('/projects-data.json');
            if (!data) {
                return;
            }
            const projects = (data.projects || []).map(p => ({
                type: 'project',
                category: 'projects',
                icon: 'code',
                title: p.displayName || p.name,
                subtitle: (p.technologies || []).slice(0, 3).join(' · ') || p.description,
                keywords: [p.name, ...(p.technologies || [])].join(' ').toLowerCase(),
                run: () => this.openProject(p),
            }));
            this.items = [...this.items, ...projects];
            if (this.isOpen) {
                this.render();
            }
        } catch (err) {
            debug.warn('[Palette] Could not load projects:', err);
        }
    }

    /** Scroll to a section, update the URL and move focus there, like a nav link does. */
    goToSection(section) {
        if (!section) {
            return;
        }
        const navigation = globalThis.appState?.managers?.navigation;
        if (navigation) {
            navigation.scrollToElement(section);
        } else {
            section.scrollIntoView({ block: 'start' });
        }
        globalThis.history.pushState(null, '', `#${section.id}`);
    }

    /** Go to a project's page when it has one, otherwise to its GitHub repo. */
    openProject(project) {
        const { pageUrl } = projectView(null, project);
        if (pageUrl) {
            globalThis.location.assign(pageUrl);
            return;
        }
        const url = project.github_repo ? `https://github.com/${project.github_repo}` : GITHUB;
        globalThis.open(url, '_blank', 'noopener');
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        if (this.isOpen) {
            return;
        }
        this.modal.showModal();
        this.input.value = '';
        this.activeIndex = 0;
        this.render();
        this.input.focus();
    }

    close() {
        if (this.isOpen) {
            this.modal.close();
        }
    }

    /**
     * Runs however the dialog closed (Esc, the close button, a click on the backdrop, or a
     * result): reset what the combobox points at. Focus has already gone back to where the
     * visitor was; that is the browser's job for a modal dialog.
     */
    onClosed = () => {
        this.input.setAttribute('aria-expanded', 'false');
        this.input.removeAttribute('aria-activedescendant');
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
        // Close first: it hands focus back to where the visitor was, and an item that
        // navigates then moves it on to its target instead of having it stolen back.
        if (!keepOpen) {
            this.close();
        }
        item.run?.();
        // Clicking an option focuses it, but options are arrow-key-only and outside the Tab
        // trap, so leaving focus there would let the next Tab walk out of the open dialog.
        if (keepOpen) {
            this.input.focus();
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

        // Say how many results there are, but only once the visitor has asked for something:
        // announcing a full unfiltered list every time the palette opens is just noise.
        const searching = query.trim() !== '' || this.activeCategory !== 'all';
        if (this.statusEl) {
            const count = this.filtered.length;
            this.statusEl.textContent = searching
                ? count === 0
                    ? 'No matches found'
                    : `${count} result${count === 1 ? '' : 's'}`
                : '';
        }

        this.input.setAttribute('aria-expanded', String(this.filtered.length > 0));

        if (this.filtered.length === 0) {
            this.input.removeAttribute('aria-activedescendant');
            this.resultsContent.innerHTML =
                query.trim() === '' ? '' : '<div class="palette-no-results">No matches found</div>';
            return;
        }

        this.input.setAttribute('aria-activedescendant', optionId(0));
        this.resultsContent.innerHTML = this.filtered
            .map((item, i) => {
                return `
                <button class="palette-item${i === 0 ? ' is-active' : ''}" id="${optionId(i)}" role="option" aria-selected="${i === 0}" tabindex="-1" data-index="${i}" type="button">
                    <span class="palette-item-icon">${icon(item.icon)}</span>
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
            el.setAttribute('aria-selected', String(active));
            if (active) {
                el.scrollIntoView({ block: 'nearest' });
                // Focus stays in the input; this tells assistive tech which option is current.
                this.input.setAttribute('aria-activedescendant', el.id);
            }
        });
    }

    /** A short confirmation, through the page's one toast (so two can never overlap). */
    flash(message) {
        globalThis.appState?.managers?.ui?.showNotification?.(message, 'success', 2000);
    }
}

export const commandPalette = new CommandPalette();
