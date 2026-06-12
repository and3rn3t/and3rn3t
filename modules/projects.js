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
        
        const curatedProjects = this.projectsData?.projects;
        if (!curatedProjects?.length) {
            debug.warn('[Projects] No curated projects found in metadata');
            this.isLoading = false;
            return;
        }
        
        const repoMap = new Map();
        
        try {
            const repos = await githubAPI.getRepositories('stars', 100);
            for (const repo of repos) {
                repoMap.set(repo.name, repo);
            }
            debug.log(`[Projects] Fetched ${repoMap.size} repos for live stats`);
        } catch (error) {
            debug.warn('[Projects] GitHub API unavailable, rendering metadata only:', error);
        }
        
        this.projects = curatedProjects.map(metadata => ({
            metadata,
            repo: repoMap.get(metadata.name) || null
        }));
        
        this.renderProjects();
        debug.log(`[Projects] Rendered ${this.projects.length} curated projects`);
        
        this.isLoading = false;
    }

    renderProjects() {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        for (const { metadata, repo } of this.projects) {
            const card = this.createProjectCard(repo, metadata);
            this.container.appendChild(card);
        }
        
        this.animateCards();
    }

    createProjectCard(repo, metadata) {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        const displayName = metadata?.displayName || repo?.name || 'Untitled';
        const description = metadata?.description || repo?.description || 'A coding project showcasing development skills.';
        const longDescription = metadata?.longDescription;
        const category = metadata?.category;
        const status = metadata?.status;
        const language = repo?.language || metadata?.technologies?.[0] || 'Code';
        const updatedDate = repo?.updated_at ? new Date(repo.updated_at).toLocaleDateString() : null;
        const htmlUrl = repo?.html_url || `https://github.com/${metadata?.github_repo || 'and3rn3t'}`;
        const homepage = repo?.homepage;
        
        const longDescHtml = longDescription ? `
            <details class="project-long-description">
                <summary>Learn more about this project...</summary>
                <p>${longDescription}</p>
                ${metadata?.highlights ? `<ul class="project-highlights">${metadata.highlights.map(h => `<li>${h}</li>`).join('')}</ul>` : ''}
            </details>
        ` : '';
        
        card.innerHTML = `
            <div class="project-header">
                ${category ? `<span class="project-category">${category}</span>` : ''}
                <h3 class="project-title">${displayName}</h3>
                <p class="project-description">${description}</p>
                ${longDescHtml}
                
                <div class="project-stats">
                    <div class="project-stat" title="Stars">
                        <i class="fas fa-star"></i>
                        <span>${repo?.stargazers_count ?? '—'}</span>
                    </div>
                    <div class="project-stat" title="Forks">
                        <i class="fas fa-code-branch"></i>
                        <span>${repo?.forks_count ?? '—'}</span>
                    </div>
                    <div class="project-stat" title="Open Issues">
                        <i class="fas fa-circle-dot"></i>
                        <span>${repo?.open_issues_count ?? '—'}</span>
                    </div>
                    ${updatedDate ? `
                    <div class="project-stat" title="Last Updated">
                        <i class="fas fa-calendar"></i>
                        <span>${updatedDate}</span>
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
