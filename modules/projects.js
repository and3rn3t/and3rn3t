/**
 * Projects Module
 * Project loading, display, filtering, and project card management
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';

// Project display configuration
const CONFIG = {
    cardAnimationDelay: 100,
    fallbackDataPath: 'projects-data.json'
};

export class ProjectsManager {
    constructor() {
        this.projects = [];
        this.projectsData = null;
        this.container = null;
        this.isLoading = false;
        this.isInitialized = false;
    }

    async init(containerSelector = '#projects-grid') {
        if (this.isInitialized) return;
        
        debug.log('[Projects] Initializing projects manager...');
        
        this.container = document.querySelector(containerSelector);
        if (!this.container) {
            debug.warn('[Projects] Container not found:', containerSelector);
            return;
        }
        
        // Load projects metadata
        await this.loadProjectsMetadata();
        
        // Load and render projects
        await this.loadProjects();
        
        this.isInitialized = true;
        debug.log('[Projects] Projects manager initialized');
    }

    async loadProjectsMetadata() {
        try {
            const response = await fetch(CONFIG.fallbackDataPath);
            if (response.ok) {
                this.projectsData = await response.json();
            }
        } catch (error) {
            debug.warn('[Projects] Could not load projects-data.json');
        }
    }

    async loadProjects() {
        if (!this.container) return;
        
        this.isLoading = true;

        // Build a map of all repos from the GitHub data cache
        const repoMap = new Map();
        let selfStarredNames = null;

        try {
            const cachedData = await githubAPI.loadCachedGitHubData();
            const repos = cachedData?.repositories ?? await githubAPI.getRepositories('pushed', 100);
            for (const repo of repos) {
                repoMap.set(repo.name, repo);
            }
            // Starred list from workflow — the primary curation signal
            if (Array.isArray(cachedData?.selfStarredRepoNames) && cachedData.selfStarredRepoNames.length) {
                selfStarredNames = new Set(cachedData.selfStarredRepoNames);
            }
            debug.log(`[Projects] ${repoMap.size} repos loaded, starred signal: ${selfStarredNames ? [...selfStarredNames].join(', ') : 'unavailable (fallback to curated list)'}`);
        } catch (error) {
            debug.warn('[Projects] GitHub API unavailable, falling back to metadata only:', error);
        }

        // Build metadata lookup from projects-data.json
        const metaMap = new Map();
        for (const m of (this.projectsData?.projects ?? [])) {
            metaMap.set(m.name, m);
            // Also index by github_repo basename (e.g. "and3rn3t/health" → "health")
            if (m.github_repo) {
                const basename = m.github_repo.split('/').pop();
                if (basename !== m.name) metaMap.set(basename, m);
            }
        }

        if (selfStarredNames?.size) {
            // PRIMARY PATH: self-starred repos drive the list
            this.projects = [...selfStarredNames]
                .map(name => ({
                    metadata: metaMap.get(name) ?? null,
                    repo: repoMap.get(name) ?? null,
                }))
                .filter(({ repo, metadata }) => repo || metadata); // drop ghosts
        } else {
            // FALLBACK: static curated list from projects-data.json
            const curatedProjects = this.projectsData?.projects;
            if (!curatedProjects?.length) {
                debug.warn('[Projects] No curated projects found in metadata');
                this.isLoading = false;
                return;
            }
            this.projects = curatedProjects.map(metadata => ({
                metadata,
                repo: repoMap.get(metadata.name) ?? null,
            }));
        }

        this.renderProjects();
        debug.log(`[Projects] Rendered ${this.projects.length} projects`);
        this.isLoading = false;
    }

    renderProjects() {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        // Sort by pushed_at descending; curated-only entries (no repo) go last
        const sorted = [...this.projects].sort((a, b) => {
            const aDate = a.repo?.pushed_at ? new Date(a.repo.pushed_at) : new Date(0);
            const bDate = b.repo?.pushed_at ? new Date(b.repo.pushed_at) : new Date(0);
            return bDate - aDate;
        });
        
        for (const { metadata, repo } of sorted) {
            const card = this.createProjectCard(repo, metadata);
            this.container.appendChild(card);
        }
        
        this.animateCards();
    }

    createProjectCard(repo, metadata) {
        const card = document.createElement('div');
        
        const displayName = metadata?.displayName || repo?.name || 'Untitled';
        const description = metadata?.description || repo?.description || 'A coding project showcasing development skills.';
        const longDescription = metadata?.longDescription;
        const category = metadata?.category;
        const status = metadata?.status;
        const language = repo?.language || metadata?.technologies?.[0] || 'Code';
        const htmlUrl = repo?.html_url || `https://github.com/${metadata?.github_repo || 'and3rn3t'}`;
        const homepage = repo?.homepage;
        const highlights = metadata?.highlights ?? [];

        // Relative push time ("3 days ago", "2 months ago")
        const pushedAt = repo?.pushed_at;
        const relativePush = pushedAt ? this._relativeTime(new Date(pushedAt)) : null;

        // Mark cards pushed within the last 180 days as recently active
        const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;
        const isRecent = pushedAt
            ? (Date.now() - new Date(pushedAt).getTime()) < SIX_MONTHS_MS
            : false;

        card.className = isRecent ? 'project-card project-card--recent' : 'project-card';
        
        // First highlight shown inline; rest collapsed in <details>
        const [firstHighlight, ...restHighlights] = highlights;

        const longDescHtml = longDescription ? `
            <details class="project-long-description">
                <summary>More about this project…</summary>
                <p>${longDescription}</p>
                ${restHighlights.length ? `<ul class="project-highlights">${restHighlights.map(h => `<li>${h}</li>`).join('')}</ul>` : ''}
            </details>
        ` : '';
        
        card.innerHTML = `
            <div class="project-header">
                <div class="project-card-badges">
                    ${category ? `<span class="project-category">${category}</span>` : ''}
                    ${isRecent ? `<span class="project-recent-badge"><span class="recent-dot"></span>Active</span>` : ''}
                </div>
                <h3 class="project-title">${displayName}</h3>
                <p class="project-description">${description}</p>
                ${firstHighlight ? `<p class="project-highlight-lead">→ ${firstHighlight}</p>` : ''}
                ${longDescHtml}
                
                <div class="project-stats">
                    <div class="project-stat" title="Stars">
                        <i class="fas fa-star"></i>
                        <span>${repo?.stargazers_count ?? '—'}</span>
                    </div>
                    ${relativePush ? `
                    <div class="project-stat" title="Last pushed">
                        <i class="fas fa-code-commit"></i>
                        <span>${relativePush}</span>
                    </div>` : ''}
                </div>
                
                <div class="project-languages">
                    <span class="language-tag primary">${language}</span>
                    ${(repo?.topics?.slice(0, 3) || metadata?.technologies?.slice(1, 4) || []).map(tag => 
                        `<span class="language-tag">${tag}</span>`
                    ).join('')}
                    ${status ? `<span class="status-badge ${status.toLowerCase().replace(/\s+/g, '-')}">${status}</span>` : ''}
                </div>
            </div>
            
            <div class="project-links">
                <a href="${htmlUrl}" target="_blank" rel="noopener noreferrer" class="project-link">
                    <i class="fab fa-github"></i>
                    View Code
                </a>
                ${homepage ? `
                    <a href="${homepage}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        <i class="fas fa-external-link-alt"></i>
                        Live Demo
                    </a>
                ` : `
                    <a href="${htmlUrl}/blob/main/README.md" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        <i class="fas fa-file-alt"></i>
                        Documentation
                    </a>
                `}
            </div>
        `;
        
        return card;
    }

    _relativeTime(date) {
        const diff = Date.now() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours   = Math.floor(diff / 3600000);
        const days    = Math.floor(diff / 86400000);
        const weeks   = Math.floor(days / 7);
        const months  = Math.floor(days / 30);
        const years   = Math.floor(days / 365);
        if (minutes < 60)  return `${minutes}m ago`;
        if (hours   < 24)  return `${hours}h ago`;
        if (days    < 7)   return `${days}d ago`;
        if (weeks   < 5)   return `${weeks}w ago`;
        if (months  < 12)  return `${months}mo ago`;
        return `${years}y ago`;
    }

    animateCards() {
        const cards = this.container?.querySelectorAll('.project-card');
        if (!cards) return;
        
        cards.forEach((card, index) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, index * CONFIG.cardAnimationDelay);
        });
    }

    async refresh() {
        debug.log('[Projects] Refreshing projects...');
        await this.loadProjects();
    }

    destroy() {
        this.projects = [];
        this.isInitialized = false;
    }
}

export const projectsManager = new ProjectsManager();
export default projectsManager;
