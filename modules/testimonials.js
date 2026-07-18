/**
 * Testimonials Module
 *
 * Reads testimonials-data.json and renders quote cards into
 * #testimonials-grid. The whole #testimonials section stays hidden
 * until at least one testimonial exists, so the empty scaffold ships
 * safely with no visible change.
 */

import { debug } from './debug.js';
import { escapeHtml } from './utils/html.js';

class TestimonialsManager {
    async init() {
        try {
            const data = await this.#loadData();
            const entries = data?.testimonials;
            if (!Array.isArray(entries) || entries.length === 0) return;

            const section = document.querySelector('#testimonials');
            const grid = document.querySelector('#testimonials-grid');
            if (!section || !grid) return;

            grid.innerHTML = entries.map(entry => this.#renderCard(entry)).join('');
            section.hidden = false;
            debug.log(`[Testimonials] ${entries.length} rendered`);
        } catch (err) {
            debug.warn('[Testimonials] Skipped:', err);
        }
    }

    async #loadData() {
        const resp = await fetch('/testimonials-data.json');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    #renderCard(entry) {
        const name = escapeHtml(entry.name ?? '');
        const meta = [entry.role, entry.company]
            .filter(Boolean)
            .map(v => escapeHtml(v))
            .join(' · ');
        const safeLink = this.#safeUrl(entry.link);
        const attribution = safeLink
            ? `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">${name}</a>`
            : name;

        return `
            <figure class="testimonial-card">
                <blockquote class="testimonial-quote">${escapeHtml(entry.quote ?? '')}</blockquote>
                <figcaption class="testimonial-attribution">
                    <span class="testimonial-name">${attribution}</span>
                    ${meta ? `<span class="testimonial-meta">${meta}</span>` : ''}
                </figcaption>
            </figure>`;
    }


    /** Only allow http(s) links — rejects javascript: and other unsafe schemes. */
    #safeUrl(url) {
        if (!url) return null;
        try {
            const parsed = new URL(url, globalThis.location.origin);
            return ['http:', 'https:'].includes(parsed.protocol) ? url : null;
        } catch {
            return null;
        }
    }
}

export const testimonialsManager = new TestimonialsManager();
