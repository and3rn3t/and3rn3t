/**
 * Experience & Timeline Module
 *
 * Reads experience-data.json and renders a vertical timeline into
 * #experience-timeline (work history) and #education-timeline (education).
 * Fails silently if data is missing — the section stays hidden via CSS.
 */

import { debug } from './debug.js';

class ExperienceManager {
    async init() {
        try {
            const data = await this.#loadData();
            if (!data) return;

            this.#renderTimeline('#experience-timeline', data.experience, 'work');
            this.#renderTimeline('#education-timeline', data.education, 'edu');
            debug.log('[Experience] Timeline rendered');
        } catch (err) {
            debug.warn('[Experience] Failed to render timeline:', err);
        }
    }

    async #loadData() {
        const resp = await fetch('/experience-data.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    #renderTimeline(selector, entries, type) {
        const container = document.querySelector(selector);
        if (!container || !Array.isArray(entries) || !entries.length) return;

        container.innerHTML = entries.map(entry => this.#renderEntry(entry, type)).join('');
    }

    #renderEntry(entry, type) {
        const dateRange =
            type === 'work'
                ? this.#formatDateRange(entry.startDate, entry.endDate, entry.current)
                : this.#formatDateRange(entry.startDate, entry.endDate, false);

        const nameField = type === 'work' ? entry.company : entry.institution;
        const nameUrl = type === 'work' ? entry.companyUrl : entry.institutionUrl;
        const titleField = type === 'work' ? entry.role : entry.degree;

        const nameHtml = nameUrl
            ? `<a href="${this.#escHtml(nameUrl)}" target="_blank" rel="noopener noreferrer" class="timeline-company-link">${this.#escHtml(nameField)}</a>`
            : this.#escHtml(nameField);

        const locationHtml = entry.location
            ? `<span class="timeline-location"><i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${this.#escHtml(entry.location)}</span>`
            : '';

        const highlightsHtml = entry.highlights?.length
            ? `<ul class="timeline-highlights">${entry.highlights.map(h => this.#highlightLi(h)).join('')}</ul>`
            : '';

        const techHtml = entry.technologies?.length
            ? `<div class="timeline-tech">${entry.technologies.map(t => this.#techTag(t)).join('')}</div>`
            : '';

        const summaryHtml = entry.summary
            ? `<p class="timeline-summary">${this.#escHtml(entry.summary)}</p>`
            : '';

        const currentBadge = entry.current
            ? '<span class="timeline-current-badge">Current</span>'
            : '';

        return `
            <article class="timeline-item${entry.current ? ' timeline-item--current' : ''}">
                <div class="timeline-dot" aria-hidden="true"></div>
                <div class="timeline-content">
                    <header class="timeline-header">
                        <div class="timeline-title-row">
                            <h3 class="timeline-role">${this.#escHtml(titleField)}</h3>
                            ${currentBadge}
                        </div>
                        <div class="timeline-meta">
                            <span class="timeline-company">${nameHtml}</span>
                            ${locationHtml}
                            <span class="timeline-dates"><i class="fas fa-calendar-alt" aria-hidden="true"></i> ${this.#escHtml(dateRange)}</span>
                        </div>
                    </header>
                    ${summaryHtml}
                    ${highlightsHtml}
                    ${techHtml}
                </div>
            </article>`;
    }

    #formatDateRange(startDate, endDate, current) {
        const fmt = d => {
            if (!d) return '';
            const [year, month] = d.split('-');
            const months = [
                'Jan',
                'Feb',
                'Mar',
                'Apr',
                'May',
                'Jun',
                'Jul',
                'Aug',
                'Sep',
                'Oct',
                'Nov',
                'Dec',
            ];
            return `${months[Number(month) - 1]} ${year}`;
        };
        const end = current ? 'Present' : fmt(endDate);
        return `${fmt(startDate)} – ${end}`;
    }

    #highlightLi(text) {
        return `<li>${this.#escHtml(text)}</li>`;
    }
    #techTag(text) {
        return `<span class="timeline-tech-tag">${this.#escHtml(text)}</span>`;
    }

    #escHtml(str) {
        return String(str ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }
}

export const experienceManager = new ExperienceManager();
