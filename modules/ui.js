/**
 * UI Module
 * Handles all DOM manipulation, animations, and UI components
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';

// Language colors for stats display
const LANGUAGE_COLORS = {
    JavaScript: '#f1e05a',
    Python: '#3572A5',
    HTML: '#e34c26',
    CSS: '#563d7c',
    TypeScript: '#2b7489',
    Java: '#b07219',
    Go: '#00ADD8',
    Ruby: '#701516',
    PHP: '#4F5D95',
    'C++': '#f34b7d',
    C: '#555555',
    Shell: '#89e051',
    'C#': '#178600',
    Swift: '#ffac45',
    Kotlin: '#F18E33',
    Rust: '#dea584',
};

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
        this.initTypingEffect();
        this.initBackToTop();
        this.initSkillInteractions();
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
            '.hero-content, .about-text, .skills-grid, .animate-on-scroll'
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
    // Typing Effect
    // ========================================

    initTypingEffect() {
        const texts = [
            'Full-Stack Developer',
            'Technology Enthusiast',
            'IoT Specialist',
            'Problem Solver',
        ];

        let textIndex = 0;
        let charIndex = 0;
        let isDeleting = false;
        const typingSpeed = 100;
        const deletingSpeed = 50;
        const pauseDuration = 2000;

        const heroSubtitle = document.querySelector('.hero-subtitle');
        if (!heroSubtitle) return;

        const typeEffect = () => {
            const currentText = texts[textIndex];

            if (isDeleting) {
                heroSubtitle.textContent = currentText.substring(0, charIndex - 1);
                charIndex--;
            } else {
                heroSubtitle.textContent = currentText.substring(0, charIndex + 1);
                charIndex++;
            }

            let timeout = isDeleting ? deletingSpeed : typingSpeed;

            if (!isDeleting && charIndex === currentText.length) {
                timeout = pauseDuration;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                textIndex = (textIndex + 1) % texts.length;
            }

            setTimeout(typeEffect, timeout);
        };

        setTimeout(typeEffect, 1000);
    }

    // ========================================
    // Back to Top
    // ========================================

    initBackToTop() {
        let backToTopBtn = document.querySelector('.back-to-top');

        if (!backToTopBtn) {
            backToTopBtn = document.createElement('button');
            backToTopBtn.className = 'back-to-top';
            backToTopBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
            backToTopBtn.setAttribute('aria-label', 'Back to top');
            document.body.appendChild(backToTopBtn);
        }

        globalThis.addEventListener(
            'scroll',
            () => {
                if (globalThis.pageYOffset > 300) {
                    backToTopBtn.classList.add('visible');
                } else {
                    backToTopBtn.classList.remove('visible');
                }
            },
            { passive: true }
        );

        backToTopBtn.addEventListener('click', () => {
            globalThis.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ========================================
    // Skill Interactions
    // ========================================

    initSkillInteractions() {
        const skillItems = document.querySelectorAll('.skill-item');

        for (const item of skillItems) {
            item.addEventListener('mouseenter', function () {
                this.style.transform = 'translateY(-3px) scale(1.05)';
            });

            item.addEventListener('mouseleave', function () {
                this.style.transform = 'translateY(0) scale(1)';
            });
        }
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
        const languageStats = document.getElementById('main-language-stats');

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
                    <i class="fas fa-code-branch"></i>
                    <div class="stat-content">
                        <h3>${userData.public_repos}</h3>
                        <p>Public Repos</p>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-bolt"></i>
                    <div class="stat-content">
                        <h3>${activeRepos}</h3>
                        <p>Active (6 mo)</p>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-star"></i>
                    <div class="stat-content">
                        <h3>${totalStars}</h3>
                        <p>Total Stars</p>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-calendar"></i>
                    <div class="stat-content">
                        <h3>${yearsSince}+</h3>
                        <p>Years on GitHub</p>
                    </div>
                </div>
            `;

            await this.loadLanguageStats(repos, languageStats);

            if (contributionGraph) {
                const contributions = await githubAPI.getContributions();
                this.renderContributionHeatmap(contributions, contributionGraph);
            }

            debug.log('[UI] GitHub stats loaded');
        } catch (error) {
            debug.warn('[UI] Failed to load GitHub stats:', error);
            if (statsGrid) {
                statsGrid.innerHTML =
                    '<p class="error-message">Unable to load GitHub statistics at this time.</p>';
            }
        }
    }

    async loadLanguageStats(repos, container) {
        if (!container) {
            container = document.getElementById('main-language-stats');
        }
        if (!container) return;

        // Prefer real language bytes from the daily data workflow; fall back to
        // counting each repo's primary language when bytes aren't available yet.
        const byteData = await githubAPI.getLanguageBytes();
        let entries;
        if (byteData && Object.keys(byteData).length > 0) {
            entries = Object.entries(byteData);
        } else {
            const languages = {};
            for (const repo of repos) {
                if (repo.language) {
                    languages[repo.language] = (languages[repo.language] || 0) + 1;
                }
            }
            entries = Object.entries(languages);
        }

        const sortedLanguages = entries.toSorted((a, b) => b[1] - a[1]).slice(0, 8);

        const total = sortedLanguages.reduce((sum, [, count]) => sum + count, 0);
        if (total === 0) return;

        container.innerHTML = `
            <div class="language-stats-container">
                <h4>Languages Used</h4>
                <div class="language-bars">
                    ${sortedLanguages
                        .map(([lang, count]) => {
                            const percent = (count / total) * 100;
                            return `
                        <div class="language-bar-item">
                            <div class="language-bar-header">
                                <span class="language-name">${lang}</span>
                                <span class="language-percentage">${percent.toFixed(1)}%</span>
                            </div>
                            <div class="language-bar">
                                <div class="language-bar-fill" style="width: ${percent}%; background-color: ${LANGUAGE_COLORS[lang] || '#666'}"></div>
                            </div>
                        </div>`;
                        })
                        .join('')}
                </div>
            </div>
        `;
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

    // ========================================
    // Skills Matrix
    // ========================================

    async loadSkillsMatrix() {
        try {
            const response = await fetch('projects-data.json');
            const projectsData = await response.json();

            if (!projectsData.skills) return;

            const skillsSection = document.querySelector('#skills .skills-grid');
            if (!skillsSection) return;

            const skillsMatrix = document.createElement('div');
            skillsMatrix.className = 'skills-matrix';
            skillsMatrix.innerHTML = `
                <h3 class="subsection-title">Proficiency Levels</h3>
                <div class="skills-matrix-grid">
                    ${Object.entries(projectsData.skills.languages)
                        .map(
                            ([lang, data]) => `
                        <div class="skill-matrix-item">
                            <div class="skill-matrix-header">
                                <span class="skill-name">${lang}</span>
                                <span class="skill-level-label">${data.level}</span>
                            </div>
                            <div class="skill-level-indicator">
                                <div class="skill-level-bar">
                                    <div class="skill-level-fill" style="width: ${this.getLevelPercentage(data.level)}%"></div>
                                </div>
                            </div>
                            <div class="skill-experience">${data.years} years experience</div>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            `;

            skillsSection.parentElement.appendChild(skillsMatrix);
            debug.log('[UI] Skills matrix loaded');
        } catch (error) {
            debug.warn('[UI] Failed to load skills matrix:', error);
        }
    }

    getLevelPercentage(level) {
        const levels = {
            Beginner: 25,
            Intermediate: 50,
            Advanced: 85,
            Expert: 100,
        };
        return levels[level] || 50;
    }

    destroy() {
        this.isInitialized = false;
        this.activeTasks.clear();
    }
}

export const uiManager = new UIManager();
export default uiManager;
