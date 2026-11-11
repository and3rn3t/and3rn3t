/**
 * UI Module
 * Handles all DOM manipulation, animations, and UI components
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';
import { icon } from './utils/icon.js';

const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);
const TOAST_FADE_MS = 300; // a little longer than the CSS transition
const MOBILE_HEATMAP_WEEKS = 20;
const ACTIVE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000; // "active" = pushed to in the last six months

export class UIManager {
    constructor() {
        this.isInitialized = false;
        this.loadingBar = null;
        this.activeTasks = new Set();
        this.toastHideTimer = 0;
        this.toastClearTimer = 0;
    }

    init() {
        if (this.isInitialized) return;

        debug.log('[UI] Initializing UI manager...');

        this.ensureNotificationRegion();

        this.initBackToTop();

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

    /**
     * Show a transient message. One toast element is reused: a newer message replaces the
     * current one and restarts the timer, so an earlier call can't hide a later one. The
     * element stays in the page as an (empty) live region so screen readers announce changes.
     */
    /**
     * The toast is a live region, and a screen reader only announces changes to one that was
     * already in the page. init() creates it, empty, up front so even the first message is
     * announced; showNotification() falls back to creating it if init() hasn't run.
     */
    ensureNotificationRegion() {
        let notification = document.getElementById('app-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'app-notification';
            notification.className = 'app-toast';
            notification.setAttribute('role', 'status');
            notification.setAttribute('aria-live', 'polite');
            document.body.appendChild(notification);
        }
        return notification;
    }

    showNotification(message, type = 'info', duration = 5000) {
        const notification = this.ensureNotificationRegion();

        clearTimeout(this.toastHideTimer);
        clearTimeout(this.toastClearTimer);

        const variant = TOAST_TYPES.has(type) ? type : 'info';
        const wasVisible = notification.classList.contains('visible');
        notification.className = `app-toast app-toast--${variant}`;
        notification.textContent = message;
        if (wasVisible) {
            notification.classList.add('visible'); // swapped in place, no flicker
        } else {
            void notification.offsetWidth; // commit the hidden state so the slide-in animates
            notification.classList.add('visible');
        }

        this.toastHideTimer = setTimeout(() => {
            notification.classList.remove('visible');
            // Drop the text once it has faded so it can't be read out of a hidden toast.
            this.toastClearTimer = setTimeout(() => {
                notification.textContent = '';
            }, TOAST_FADE_MS);
        }, duration);
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
    // GitHub band (About): two stats and a contribution chart
    // ========================================

    /**
     * Fill in the live numbers and the chart. The band's markup is in index.html (the stats are
     * static slots, so nothing moves when the numbers arrive); with no data the band is hidden
     * rather than showing a blank or a third-party image.
     */
    async loadGitHubStats() {
        const band = document.getElementById('github-band');
        if (!band) return;

        try {
            const [repos, contributions] = await Promise.all([
                githubAPI.getRepositories('updated', 100),
                githubAPI.getContributions(),
            ]);

            // Show only what we actually have: "0 active repositories" for missing data would be
            // a false statement, so a missing number stays a dash, and no data at all hides the band.
            let hasData = false;

            if (repos.length > 0) {
                // Forks and archived repos aren't "active": they aren't mine to push to
                const active = repos.filter(
                    repo =>
                        !repo.fork &&
                        !repo.archived &&
                        Date.now() - new Date(repo.pushed_at).getTime() < ACTIVE_WINDOW_MS
                ).length;
                this.setStat('active-repos', active);
                hasData = true;
            }

            if (Number.isFinite(contributions?.total)) {
                this.setStat('contributions', contributions.total);
                hasData = true;
            }
            this.renderContributionHeatmap(
                contributions,
                document.getElementById('contribution-graph')
            );

            if (!hasData) band.hidden = true;
            debug.log('[UI] GitHub stats loaded');
        } catch (error) {
            debug.warn('[UI] Failed to load GitHub stats:', error);
            band.hidden = true;
        }
    }

    setStat(name, value) {
        const slot = document.querySelector(`[data-stat="${name}"]`);
        if (slot) slot.textContent = Number(value).toLocaleString();
    }

    /**
     * A week-by-week chart from the pre-fetched contribution calendar. Phones show only the
     * last MOBILE_HEATMAP_WEEKS weeks (the cells outside them are hidden by CSS), so each cell
     * carries its column for both layouts.
     */
    renderContributionHeatmap(contributions, container) {
        if (!container) return;

        if (!Array.isArray(contributions?.weeks) || contributions.weeks.length === 0) {
            container.hidden = true;
            return;
        }

        const firstRecentWeek = Math.max(0, contributions.weeks.length - MOBILE_HEATMAP_WEEKS);
        const cells = [];
        contributions.weeks.forEach((week, weekIndex) => {
            const isOlder = weekIndex < firstRecentWeek;
            for (const day of week.days) {
                const date = new Date(`${day.date}T00:00:00`);
                const dateLabel = date.toLocaleDateString(undefined, {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                });
                const plural = day.count === 1 ? '' : 's';
                cells.push(
                    `<i class="contrib__cell${isOlder ? ' contrib__cell--older' : ''}" data-level="${day.level}" ` +
                        `style="--week:${weekIndex + 1};--recent-week:${weekIndex - firstRecentWeek + 1};grid-row:${date.getDay() + 1}" ` +
                        `title="${day.count} contribution${plural} on ${dateLabel}"></i>`
                );
            }
        });

        const total = (contributions.total ?? 0).toLocaleString();
        container.innerHTML = `
            <figure class="contrib__figure" role="img" aria-label="${total} contributions in the last year, week by week">
                <div class="contrib__grid">${cells.join('')}</div>
                <figcaption class="contrib__foot">
                    <span class="contrib__range contrib__range--year">The last year, week by week</span>
                    <span class="contrib__range contrib__range--recent">The last ${MOBILE_HEATMAP_WEEKS} weeks</span>
                    <span class="contrib__legend" aria-hidden="true">
                        Less
                        <i class="contrib__cell" data-level="0"></i>
                        <i class="contrib__cell" data-level="1"></i>
                        <i class="contrib__cell" data-level="2"></i>
                        <i class="contrib__cell" data-level="3"></i>
                        <i class="contrib__cell" data-level="4"></i>
                        More
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
