/**
 * Projects Module
 * Project loading, display, filtering, and project card management
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';

// Project display configuration
const CONFIG = {
    maxProjects: 9,
    maxFeatured: 6,
    cardAnimationDelay: 100,
    fallbackDataPath: 'projects-data.json',
    retryAttempts: 3,
    retryDelay: 1000
};

// Demo projects fallback
const DEMO_PROJECTS = [
    {
        name: "Smart Home Dashboard",
        description: "A comprehensive home automation dashboard built with React and Python, featuring real-time IoT device monitoring and control.",
        language: "React",
        topics: ["IoT", "Python", "Dashboard"],
        stars: 15,
        forks: 3,
        updated: "2024-01-15",
        github: "https://github.com/and3rn3t",
        demo: null
    },
    {
        name: "Full-Stack E-Commerce",
        description: "Modern e-commerce platform with React frontend, Node.js backend, and PostgreSQL database. Features include user authentication and payment processing.",
        language: "JavaScript",
        topics: ["React", "Node.js", "PostgreSQL"],
        stars: 23,
        forks: 7,
        updated: "2024-01-10",
        github: "https://github.com/and3rn3t",
        demo: "#"
    },
    {
        name: "Python Data Analyzer",
        description: "Advanced data analysis tool built with Python, featuring data visualization, statistical analysis, and machine learning capabilities.",
        language: "Python",
        topics: ["Data Science", "ML", "Visualization"],
        stars: 31,
        forks: 12,
        updated: "2024-01-05",
        github: "https://github.com/and3rn3t",
        demo: null
    }
];

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
        
        try {
            // Get repositories using the API manager
            const repos = await githubAPI.getRepositories('stars', 100);
            
            // Filter and sort
            const featuredRepos = repos
                .filter(repo => !repo.fork && !repo.archived)
                .sort((a, b) => b.stargazers_count - a.stargazers_count)
                .slice(0, CONFIG.maxProjects);
            
            if (featuredRepos.length === 0) {
                this.showDemoProjects();
                return;
            }
            
            this.projects = featuredRepos;
            this.renderProjects();
            
            debug.log(`[Projects] Loaded ${this.projects.length} projects from GitHub`);
            
        } catch (error) {
            debug.warn('[Projects] GitHub API failed, using fallback:', error);
            this.showDemoProjects();
        }
        
        this.isLoading = false;
    }

    renderProjects() {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        for (const repo of this.projects) {
            const metadata = this.projectsData?.projects?.find(p => p.name === repo.name);
            const card = this.createProjectCard(repo, metadata);
            this.container.appendChild(card);
        }
        
        this.animateCards();
    }

    createProjectCard(repo, metadata) {
        const card = document.createElement('div');
        card.className = 'project-card';
        
        const displayName = metadata?.displayName || repo.name;
        const description = metadata?.description || repo.description || 'A coding project showcasing development skills.';
        const longDescription = metadata?.longDescription;
        const category = metadata?.category;
        const status = metadata?.status;
        const language = repo.language || 'Code';
        const updatedDate = new Date(repo.updated_at).toLocaleDateString();
        
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
                        <span>${repo.stargazers_count}</span>
                    </div>
                    <div class="project-stat" title="Forks">
                        <i class="fas fa-code-branch"></i>
                        <span>${repo.forks_count}</span>
                    </div>
                    <div class="project-stat" title="Open Issues">
                        <i class="fas fa-circle-dot"></i>
                        <span>${repo.open_issues_count}</span>
                    </div>
                    <div class="project-stat" title="Last Updated">
                        <i class="fas fa-calendar"></i>
                        <span>${updatedDate}</span>
                    </div>
                </div>
                
                <div class="project-languages">
                    <span class="language-tag primary">${language}</span>
                    ${repo.topics ? repo.topics.slice(0, 3).map(topic => 
                        `<span class="language-tag">${topic}</span>`
                    ).join('') : ''}
                    ${status ? `<span class="status-badge ${status.toLowerCase().replace(/\s+/g, '-')}">${status}</span>` : ''}
                </div>
            </div>
            
            <div class="project-links">
                <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="project-link">
                    <i class="fab fa-github"></i>
                    View Code
                </a>
                ${repo.homepage ? `
                    <a href="${repo.homepage}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        <i class="fas fa-external-link-alt"></i>
                        Live Demo
                    </a>
                ` : `
                    <a href="${repo.html_url}/blob/main/README.md" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        <i class="fas fa-file-alt"></i>
                        Documentation
                    </a>
                `}
            </div>
        `;
        
        return card;
    }

    showDemoProjects() {
        if (!this.container) return;
        
        this.container.innerHTML = '';
        
        for (const project of DEMO_PROJECTS) {
            const card = document.createElement('div');
            card.className = 'project-card';
            
            card.innerHTML = `
                <div class="project-header">
                    <h3 class="project-title">${project.name}</h3>
                    <p class="project-description">${project.description}</p>
                    
                    <div class="project-stats">
                        <div class="project-stat">
                            <i class="fas fa-star"></i>
                            <span>${project.stars}</span>
                        </div>
                        <div class="project-stat">
                            <i class="fas fa-code-branch"></i>
                            <span>${project.forks}</span>
                        </div>
                        <div class="project-stat">
                            <i class="fas fa-calendar"></i>
                            <span>${new Date(project.updated).toLocaleDateString()}</span>
                        </div>
                    </div>
                    
                    <div class="project-languages">
                        <span class="language-tag">${project.language}</span>
                        ${project.topics.map(topic => `<span class="language-tag">${topic}</span>`).join('')}
                    </div>
                </div>
                
                <div class="project-links">
                    <a href="${project.github}" target="_blank" rel="noopener noreferrer" class="project-link">
                        <i class="fab fa-github"></i>
                        View Code
                    </a>
                    ${project.demo ? `
                        <a href="${project.demo}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                            <i class="fas fa-external-link-alt"></i>
                            Live Demo
                        </a>
                    ` : `
                        <a href="${project.github}" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                            <i class="fas fa-file-alt"></i>
                            Learn More
                        </a>
                    `}
                </div>
            `;
            
            this.container.appendChild(card);
        }
        
        this.animateCards();
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
