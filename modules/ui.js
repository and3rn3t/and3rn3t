/**
 * UI Module
 * Handles all DOM manipulation, animations, and UI components
 */

import { debug } from './debug.js';
import { githubAPI } from './github-api.js';

const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);
const TOAST_FADE_MS = 300; // a little longer than the CSS transition
const MOBILE_HEATMAP_WEEKS = 20;
const ACTIVE_WINDOW_MS = 180 * 24 * 60 * 60 * 1000; // "active" = pushed to in the last six months

export class UIManager {
    constructor() {
        this.isInitialized = false;
        this.toastHideTimer = 0;
        this.toastClearTimer = 0;
    }

    init() {
        if (this.isInitialized) return;

        debug.log('[UI] Initializing UI manager...');

        this.ensureNotificationRegion();

        this.isInitialized = true;
        debug.log('[UI] UI manager initialized');
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

            // getRepositories() throws when the data is unavailable, so an array, even an empty
            // one, is known data: a user with no public repositories really has none active.
            // The contribution calendar is the part that can be missing, and stays a dash.
            const active = repos.filter(
                repo =>
                    !repo.fork &&
                    !repo.archived &&
                    Date.now() - new Date(repo.pushed_at).getTime() < ACTIVE_WINDOW_MS
            ).length;
            this.setStat('active-repos', active);

            if (Number.isFinite(contributions?.total)) {
                this.setStat('contributions', contributions.total);
            }
            this.renderContributionHeatmap(
                contributions,
                document.getElementById('contribution-graph')
            );
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
            // Hide the wrapper that reserves the chart's space too, so no empty gap is left
            (container.closest('.github-band__chart') ?? container).hidden = true;
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

        container.innerHTML = `
            <figure class="contrib__figure" role="img" aria-label="Contribution activity, week by week">
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
    }
}

export const uiManager = new UIManager();
