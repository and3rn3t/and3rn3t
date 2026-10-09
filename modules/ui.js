/**
 * UI Module
 * Handles all DOM manipulation, animations, and UI components
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';
import { icon } from './utils/icon.js';

export class UIManager {
    constructor() {
        this.isInitialized = false;
        this.loadingBar = null;
        this.activeTasks = new Set();
    }

    init() {
        if (this.isInitialized) return;

        debug.log('[UI] Initializing UI manager...');

        this.initScrollAnimations();
        this.initBackToTop();
        this.initParallax();

        this.isInitialized = true;
        debug.log('[UI] UI manager initialized');
    }

    // ========================================
    // Loading Progress
    // ========================================

    showLoadingProgress(taskName = 'global') {
        this.activeTasks.add(taskName);

        if (!this.loadingBar) {
            this.loadingBar = document.createElement('div');
            this.loadingBar.id = 'global-loading-progress';
            this.loadingBar.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: var(--primary-color);
                background-size: 200% 100%;
                animation: loading-gradient 2s ease-in-out infinite;
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.3s ease;
            `;

            if (!document.querySelector('#loading-keyframes')) {
                const style = document.createElement('style');
                style.id = 'loading-keyframes';
                style.textContent = `
                    @keyframes loading-gradient {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(this.loadingBar);
        }

        setTimeout(() => {
            if (this.loadingBar) {
                this.loadingBar.style.opacity = '1';
            }
        }, 100);
    }

    hideLoadingProgress(taskName = 'global') {
        this.activeTasks.delete(taskName);

        if (this.activeTasks.size === 0 && this.loadingBar) {
            this.loadingBar.style.opacity = '0';
            setTimeout(() => {
                if (this.loadingBar?.parentNode) {
                    this.loadingBar.parentNode.removeChild(this.loadingBar);
                    this.loadingBar = null;
                }
            }, 300);
        }
    }

    // ========================================
    // Notifications
    // ========================================

    showNotification(message, type = 'info', duration = 5000) {
        let notification = document.getElementById('app-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'app-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 1000;
                max-width: 350px;
                font-size: 14px;
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
            `;
            document.body.appendChild(notification);
        }

        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6',
        };

        notification.style.background = colors[type] || colors.info;
        notification.style.color = 'white';
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${message}</span>
            </div>
        `;

        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // ========================================
    // Scroll Animations
    // ========================================

    initScrollAnimations() {
        const animationElements = document.querySelectorAll(
            '.hero-content, .about-text, .animate-on-scroll'
        );

        const animationObserver = new IntersectionObserver(
            entries => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animate-in');
                    }
                }
            },
            { threshold: 0.1 }
        );

        for (const el of animationElements) {
            const rect = el.getBoundingClientRect();
            const isInViewport = rect.top < globalThis.innerHeight;

            if (isInViewport) {
                el.classList.add('animate-in');
            }

            animationObserver.observe(el);
        }
    }

    // ========================================
    // Back to Top
    // ========================================

    initBackToTop() {
        let backToTopBtn = document.querySelector('.back-to-top');

        if (!backToTopBtn) {
            backToTopBtn = document.createElement('button');
            backToTopBtn.className = 'back-to-top';
            backToTopBtn.innerHTML = icon('arrow-up');
            backToTopBtn.setAttribute('aria-label', 'Back to top');
            document.body.appendChild(backToTopBtn);
        }

        globalThis.addEventListener(
            'scroll',
            () => {
                if (globalThis.pageYOffset > 400) {
                    backToTopBtn.classList.add('visible');
                } else {
                    backToTopBtn.classList.remove('visible');
                }
            },
            { passive: true }
        );

        backToTopBtn.addEventListener('click', () => {
            globalThis.scrollTo({ top: 0 });
        });
    }

    // ========================================
    // Parallax Effect
    // ========================================

    initParallax() {
        globalThis.addEventListener(
            'scroll',
            () => {
                const scrolled = globalThis.pageYOffset;
                const parallaxElements = document.querySelectorAll('.hero');

                for (const element of parallaxElements) {
                    const speed = 0.5;
                    element.style.backgroundPositionY = `${scrolled * speed}px`;
                }
            },
            { passive: true }
        );
    }

    // ========================================
    // GitHub Stats Display
    // ========================================

    async loadGitHubStats() {
        const statsGrid = document.getElementById('stats-grid');
        const contributionGraph = document.getElementById('contribution-graph');

        if (!statsGrid) return;

        try {
            const [userData, repos] = await Promise.all([
                githubAPI.getUserData(),
                githubAPI.getRepositories('updated', 100),
            ]);

            const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
            const activeRepos = repos.filter(r => {
                const sixMonths = Date.now() - 180 * 24 * 60 * 60 * 1000;
                return new Date(r.pushed_at) > sixMonths;
            }).length;
            const yearsSince = new Date().getFullYear() - 2021;

            statsGrid.innerHTML = `
                <div class="stat-card">
                    ${icon('code-branch')}
                    <div class="stat-content">
                        <h3>${userData.public_repos}</h3>
                        <p>Public Repos</p>
                    </div>
                </div>
                <div class="stat-card">
                    ${icon('bolt')}
                    <div class="stat-content">
                        <h3>${activeRepos}</h3>
                        <p>Active (6 mo)</p>
                    </div>
                </div>
                <div class="stat-card">
                    ${icon('star')}
                    <div class="stat-content">
                        <h3>${totalStars}</h3>
                        <p>Total Stars</p>
                    </div>
                </div>
                <div class="stat-card">
                    ${icon('calendar')}
                    <div class="stat-content">
                        <h3>${yearsSince}+</h3>
                        <p>Years on GitHub</p>
                    </div>
                </div>
            `;

            if (contributionGraph) {
                const contributions = await githubAPI.getContributions();
                this.renderContributionHeatmap(contributions, contributionGraph);
            }

            debug.log('[UI] GitHub stats loaded');
        } catch (error) {
            debug.warn('[UI] Failed to load GitHub stats:', error);
            if (statsGrid) {
                statsGrid.innerHTML =
                    '<p class="error-message show">Unable to load GitHub statistics at this time.</p>';
            }
        }
    }

    // Render a GitHub-style contribution heatmap from pre-fetched calendar data.
    // Falls back to the third-party chart image when data isn't available yet.
    renderContributionHeatmap(contributions, container) {
        if (!container) return;

        if (
            !contributions ||
            !Array.isArray(contributions.weeks) ||
            contributions.weeks.length === 0
        ) {
            container.innerHTML = `
                <div class="contribution-widget">
                    <img src="https://ghchart.rshah.org/16a34a/and3rn3t" alt="GitHub contribution graph" loading="lazy" />
                </div>
            `;
            return;
        }

        const cells = [];
        contributions.weeks.forEach((week, weekIndex) => {
            for (const day of week.days) {
                const weekday = new Date(`${day.date}T00:00:00`).getDay();
                const dateLabel = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                });
                const plural = day.count === 1 ? '' : 's';
                cells.push(
                    `<div class="heatmap-cell" data-level="${day.level}" ` +
                        `style="grid-column:${weekIndex + 1};grid-row:${weekday + 1}" ` +
                        `title="${day.count} contribution${plural} on ${dateLabel}"></div>`
                );
            }
        });

        const total = (contributions.total ?? 0).toLocaleString();
        container.innerHTML = `
            <figure class="contribution-widget" role="img" aria-label="${total} contributions in the last year">
                <div class="heatmap-grid">${cells.join('')}</div>
                <figcaption class="heatmap-footer">
                    <span class="heatmap-total">${total} contributions in the last year</span>
                    <span class="heatmap-legend" aria-hidden="true">
                        <span class="heatmap-legend-label">Less</span>
                        <span class="heatmap-cell" data-level="0"></span>
                        <span class="heatmap-cell" data-level="1"></span>
                        <span class="heatmap-cell" data-level="2"></span>
                        <span class="heatmap-cell" data-level="3"></span>
                        <span class="heatmap-cell" data-level="4"></span>
                        <span class="heatmap-legend-label">More</span>
                    </span>
                </figcaption>
            </figure>
        `;
    }

    destroy() {
        this.isInitialized = false;
        this.activeTasks.clear();
    }
}

export const uiManager = new UIManager();
export default uiManager;
