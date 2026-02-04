/**
 * UI Module
 * Handles all DOM manipulation, animations, and UI components
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';

// Language colors for stats display
const LANGUAGE_COLORS = {
    'JavaScript': '#f1e05a',
    'Python': '#3572A5',
    'HTML': '#e34c26',
    'CSS': '#563d7c',
    'TypeScript': '#2b7489',
    'Java': '#b07219',
    'Go': '#00ADD8',
    'Ruby': '#701516',
    'PHP': '#4F5D95',
    'C++': '#f34b7d',
    'C': '#555555',
    'Shell': '#89e051',
    'C#': '#178600',
    'Swift': '#ffac45',
    'Kotlin': '#F18E33',
    'Rust': '#dea584'
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
        this.forceHeroBackground();
        
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
                background: linear-gradient(90deg, #6366f1, #a855f7, #ec4899);
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
            info: '#3b82f6'
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

        const animationObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            }
        }, { threshold: 0.1 });

        for (const el of animationElements) {
            const rect = el.getBoundingClientRect();
            const isInViewport = rect.top < window.innerHeight;
            
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
            "Full-Stack Developer",
            "Technology Enthusiast",
            "IoT Specialist",
            "Problem Solver"
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
        
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }, { passive: true });
        
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ========================================
    // Skill Interactions
    // ========================================

    initSkillInteractions() {
        const skillItems = document.querySelectorAll('.skill-item');
        
        for (const item of skillItems) {
            item.addEventListener('mouseenter', function() {
                this.style.transform = 'translateY(-3px) scale(1.05)';
            });
            
            item.addEventListener('mouseleave', function() {
                this.style.transform = 'translateY(0) scale(1)';
            });
        }
    }

    // ========================================
    // Parallax Effect
    // ========================================

    initParallax() {
        window.addEventListener('scroll', () => {
            const scrolled = window.pageYOffset;
            const parallaxElements = document.querySelectorAll('.hero');
            
            for (const element of parallaxElements) {
                const speed = 0.5;
                element.style.backgroundPositionY = `${scrolled * speed}px`;
            }
        }, { passive: true });
    }

    // ========================================
    // Hero Background
    // ========================================

    forceHeroBackground() {
        const heroElement = document.querySelector('.hero, #home, section.hero');
        if (heroElement) {
            heroElement.style.setProperty('background', 'var(--gradient-primary)', 'important');
            heroElement.style.setProperty('background-image', 'var(--gradient-primary)', 'important');
        }
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
                githubAPI.getRepositories('updated', 100)
            ]);
            
            const totalStars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
            const totalForks = repos.reduce((sum, repo) => sum + repo.forks_count, 0);
            
            statsGrid.innerHTML = `
                <div class="stat-card">
                    <i class="fas fa-code-branch"></i>
                    <div class="stat-content">
                        <h3>${userData.public_repos}</h3>
                        <p>Public Repositories</p>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-users"></i>
                    <div class="stat-content">
                        <h3>${userData.followers}</h3>
                        <p>Followers</p>
                    </div>
                </div>
                <div class="stat-card">
                    <i class="fas fa-user-friends"></i>
                    <div class="stat-content">
                        <h3>${userData.following}</h3>
                        <p>Following</p>
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
                    <i class="fas fa-code-branch"></i>
                    <div class="stat-content">
                        <h3>${totalForks}</h3>
                        <p>Total Forks</p>
                    </div>
                </div>
            `;
            
            this.loadLanguageStats(repos, languageStats);
            
            if (contributionGraph) {
                contributionGraph.innerHTML = `
                    <div class="contribution-widget">
                        <img src="https://ghchart.rshah.org/f5576c/and3rn3t" alt="GitHub Contribution Graph" />
                    </div>
                `;
            }
            
            debug.log('[UI] GitHub stats loaded');
            
        } catch (error) {
            debug.warn('[UI] Failed to load GitHub stats:', error);
            if (statsGrid) {
                statsGrid.innerHTML = '<p class="error-message">Unable to load GitHub statistics at this time.</p>';
            }
        }
    }

    loadLanguageStats(repos, container) {
        if (!container) {
            container = document.getElementById('main-language-stats');
        }
        if (!container) return;
        
        const languages = {};
        for (const repo of repos) {
            if (repo.language) {
                languages[repo.language] = (languages[repo.language] || 0) + 1;
            }
        }
        
        const sortedLanguages = Object.entries(languages)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
        
        const total = sortedLanguages.reduce((sum, [, count]) => sum + count, 0);
        
        container.innerHTML = `
            <div class="language-stats-container">
                <h4>Languages Used</h4>
                <div class="language-bars">
                    ${sortedLanguages.map(([lang, count]) => `
                        <div class="language-bar-item">
                            <div class="language-bar-header">
                                <span class="language-name">${lang}</span>
                                <span class="language-percentage">${((count / total) * 100).toFixed(1)}%</span>
                            </div>
                            <div class="language-bar">
                                <div class="language-bar-fill" style="width: ${(count / total) * 100}%; background-color: ${LANGUAGE_COLORS[lang] || '#666'}"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
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
                    ${Object.entries(projectsData.skills.languages).map(([lang, data]) => `
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
                    `).join('')}
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
            'Beginner': 25,
            'Intermediate': 50,
            'Advanced': 85,
            'Expert': 100
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
