/**
 * Projects Module
 *
 * The project cards are pre-rendered into index.html by scripts/generate-site.mjs, so they
 * are on the page before any JavaScript runs. This module makes them live:
 *   - fills in the star count, "last pushed" time and "Active" badge from the cached GitHub data
 *   - registers each project's case study with the modal and opens it from the card button
 *   - runs the "Show more" expander
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';
import { projectModal } from './project-modal.js';
import { loadJSON } from './utils/data.js';
import { buildMetaMap, isRecentlyPushed, projectView, relativeTime } from './utils/projects.js';

const DATA_PATH = '/projects-data.json';

export class ProjectsManager {
    constructor() {
        this.container = null;
        this.moreButton = null;
        this.extraCount = 0;
        this.isInitialized = false;
    }

    async init(containerSelector = '#projects') {
        if (this.isInitialized) return;

        debug.log('[Projects] Initializing projects manager...');

        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            debug.warn('[Projects] Container not found:', containerSelector);
            return;
        }

        // Case-study modal: build once and open via event delegation.
        projectModal.init();
        this.container.addEventListener('click', e => {
            const trigger = e.target.closest('[data-case-study]');
            if (!trigger) return;
            e.preventDefault();
            projectModal.open(trigger.dataset.caseStudy);
        });

        this.setupShowMore();
        this.expandForDeepLink();

        await this.hydrate();

        this.isInitialized = true;
        debug.log('[Projects] Projects manager initialized');
    }

    /**
     * The curated write-ups plus the cached GitHub data. Either can be missing; the cards
     * keep their pre-rendered content when it is.
     */
    async loadSources() {
        const projectsData = await loadJSON(DATA_PATH);
        if (!projectsData) debug.warn('[Projects] Could not load projects-data.json');

        try {
            const cachedData = await githubAPI.loadCachedGitHubData();
            return {
                projectsData,
                repositories:
                    cachedData?.repositories ?? (await githubAPI.getRepositories('pushed', 100)),
            };
        } catch (error) {
            debug.warn(
                '[Projects] GitHub data unavailable, cards keep their static content:',
                error
            );
            return { projectsData, repositories: [] };
        }
    }

    /**
     * Make the pre-rendered cards live: register each card's case study and fill in its
     * star count and push time.
     *
     * This walks the cards that are on the page, not the current starred list. The HTML and
     * the JSON are cached independently, so a card can outlive its repo's star (or arrive
     * before the data that describes it); it should still work.
     */
    async hydrate() {
        const { projectsData, repositories } = await this.loadSources();
        const repoMap = new Map(repositories.map(repo => [repo.name, repo]));
        const metaMap = buildMetaMap(projectsData?.projects ?? []);

        for (const card of this.container.querySelectorAll('[data-project]')) {
            const slug = card.dataset.project;
            const metadata = metaMap.get(slug) ?? null;
            const repo =
                repoMap.get(slug) ?? repoMap.get(metadata?.github_repo?.split('/').pop()) ?? null;
            this.hydrateCard(card, projectView(repo, metadata), repo);
        }
    }

    hydrateCard(card, view, repo) {
        const pushedAt = repo?.pushed_at;
        const pushedRelative = pushedAt ? relativeTime(new Date(pushedAt)) : null;

        if (view.hasCaseStudy) {
            projectModal.register(view.slug, {
                ...view,
                stars: repo?.stargazers_count ?? null,
                forks: repo?.forks_count ?? null,
                openIssues: repo?.open_issues_count ?? null,
                pushedRelative,
            });
            // Only now does the button have something to open
            card.querySelector('[data-case-study]')?.removeAttribute('data-pending');
        }

        const stars = card.querySelector('[data-live="stars"]');
        if (stars && repo) stars.textContent = String(repo.stargazers_count ?? '—');

        const pushed = card.querySelector('[data-live="pushed"]');
        const pushedStat = card.querySelector('[data-live-stat="pushed"]');
        if (pushedRelative && pushed && pushedStat) {
            pushed.textContent = pushedRelative;
            pushedStat.hidden = false;
        }

        if (isRecentlyPushed(pushedAt)) {
            card.classList.add('project-card--recent');
            card.querySelector('.project-card-badges')?.insertAdjacentHTML(
                'beforeend',
                '<span class="project-recent-badge"><span class="recent-dot"></span>Active</span>'
            );
            // The "Active" badge already says so; don't repeat it as a status tag
            const status = card.querySelector('[data-status-active]');
            if (status) status.hidden = true;
        }
    }

    setupShowMore() {
        this.moreButton ??= document.getElementById('projects-more-btn');
        const btn = this.moreButton;
        if (!btn) return;

        this.extraCount = this.container.querySelectorAll('[data-extra]').length;
        btn.hidden = this.extraCount === 0;
        this.setExpanded(false);

        if (!btn.dataset.bound) {
            btn.dataset.bound = 'true';
            btn.addEventListener('click', () => {
                const expand = btn.getAttribute('aria-expanded') !== 'true';
                this.setExpanded(expand);
                if (expand) {
                    this.container
                        ?.querySelector('[data-extra] .project-title a')
                        ?.focus({ preventScroll: false });
                }
            });
        }
    }

    /**
     * A deep link to a hidden project's case study expands the grid, so the modal can
     * return focus to a visible card when it closes.
     */
    expandForDeepLink() {
        const { hash } = globalThis.location;
        if (!hash.startsWith('#project/')) return;
        const slug = decodeURIComponent(hash.slice('#project/'.length));
        const deepLinked = [...this.container.querySelectorAll('[data-case-study]')].find(
            el => el.dataset.caseStudy === slug
        );
        if (deepLinked?.closest('[data-extra]')) this.setExpanded(true);
    }

    setExpanded(expand) {
        for (const card of this.container?.querySelectorAll('[data-extra]') ?? []) {
            card.hidden = !expand;
        }
        const btn = this.moreButton;
        if (!btn) return;
        const plural = this.extraCount === 1 ? '' : 's';
        btn.setAttribute('aria-expanded', String(expand));
        btn.textContent = expand
            ? 'Show fewer projects'
            : `Show ${this.extraCount} more project${plural}`;
    }

    destroy() {
        this.isInitialized = false;
    }
}

export const projectsManager = new ProjectsManager();
