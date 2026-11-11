/**
 * Projects Module
 *
 * The Selected work section is pre-rendered into index.html by scripts/generate-site.mjs, so
 * it is on the page before any JavaScript runs. This module makes its case studies work:
 * it registers each project's write-up with the modal, enables that project's (until then
 * hidden) button, and opens the modal from it.
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';
import { projectModal } from './project-modal.js';
import { loadJSON } from './utils/data.js';
import { buildMetaMap, projectView, relativeTime } from './utils/projects.js';

const DATA_PATH = '/projects-data.json';

export class ProjectsManager {
    constructor() {
        this.container = null;
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
            debug.warn('[Projects] GitHub data unavailable, using the write-ups alone:', error);
            return { projectsData, repositories: [] };
        }
    }

    /**
     * Register the case study of every project on the page and enable its button.
     *
     * This walks what is on the page, not the current starred list. The HTML and the JSON are
     * cached independently, so a project can outlive its star (or arrive before the data that
     * describes it); it should still work.
     */
    async hydrate() {
        const { projectsData, repositories } = await this.loadSources();
        const repoMap = new Map(repositories.map(repo => [repo.name, repo]));
        const metaMap = buildMetaMap(projectsData?.projects ?? []);

        for (const element of this.container.querySelectorAll('[data-project]')) {
            const slug = element.dataset.project;
            const metadata = metaMap.get(slug) ?? null;
            const repo =
                repoMap.get(slug) ?? repoMap.get(metadata?.github_repo?.split('/').pop()) ?? null;
            const view = projectView(repo, metadata);
            if (!view.hasCaseStudy) continue;

            const pushedAt = repo?.pushed_at;
            projectModal.register(view.slug, {
                ...view,
                stars: repo?.stargazers_count ?? null,
                forks: repo?.forks_count ?? null,
                openIssues: repo?.open_issues_count ?? null,
                pushedRelative: pushedAt ? relativeTime(new Date(pushedAt)) : null,
            });
            // Only now does the button have something to open
            element.querySelector('[data-case-study]')?.removeAttribute('data-pending');
        }
    }

    destroy() {
        this.isInitialized = false;
    }
}

export const projectsManager = new ProjectsManager();
