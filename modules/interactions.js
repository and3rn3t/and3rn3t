/**
 * Micro-interactions
 *
 * - countUp: animate numeric stat values from 0 when scrolled into view.
 * - tilt: cursor-tracked 3D tilt + glare on cards (fine-pointer only).
 * - magnetic: subtle pull of buttons/links toward the cursor.
 *
 * All effects are capability-gated and respect reduced-motion. They set CSS
 * custom properties (`--rx`, `--ry`, `--glare-x`, ...) so the visual work stays
 * in CSS; JS only feeds values.
 *
 * @author Matthew Anderson
 */

import { canRunHeavyEffects, hasFinePointer, motion } from './capabilities.js';

/**
 * Animate count-up for elements matching `selector`. Each element's current
 * text is treated as the target (supports a trailing non-digit suffix like "+").
 * @param {string} [selector='.stat-card h3']
 */
export function initCountUp(selector = '.stat-card h3') {
    const els = Array.from(document.querySelectorAll(selector));
    if (els.length === 0) {
        return;
    }

    const animate = (el) => {
        const raw = el.textContent.trim();
        const match = raw.match(/^(\d[\d,]*)(.*)$/);
        if (!match) {
            return;
        }
        const target = Number.parseInt(match[1].replaceAll(',', ''), 10);
        const suffix = match[2] || '';
        if (motion.reduced || !Number.isFinite(target) || target === 0) {
            el.textContent = raw;
            return;
        }

        const duration = 1200;
        const start = performance.now();
        el.classList.add('is-counting');

        const step = (now) => {
            const p = Math.min((now - start) / duration, 1);
            // easeOutExpo
            const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
            const value = Math.round(target * eased);
            el.textContent = value.toLocaleString() + suffix;
            if (p < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = raw;
                el.classList.remove('is-counting');
            }
        };
        requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
        (entries, obs) => {
            for (const entry of entries) {
                if (entry.isIntersecting) {
                    animate(entry.target);
                    obs.unobserve(entry.target);
                }
            }
        },
        { threshold: 0.4 }
    );
    for (const el of els) {
        io.observe(el);
    }
}

/**
 * Attach cursor-tracked 3D tilt + glare to elements matching `selector`.
 * @param {string} [selector='.project-card']
 * @param {Object} [options]
 * @param {number} [options.max=8] max rotation in degrees
 */
export function initTilt(selector = '.project-card', { max = 8 } = {}) {
    if (!hasFinePointer || !canRunHeavyEffects()) {
        return;
    }
    const cards = Array.from(document.querySelectorAll(selector));

    for (const card of cards) {
        card.classList.add('tilt-enabled');
        let rafId = 0;

        const onMove = (event) => {
            if (rafId) {
                return;
            }
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                const rect = card.getBoundingClientRect();
                const px = (event.clientX - rect.left) / rect.width; // 0..1
                const py = (event.clientY - rect.top) / rect.height;
                const ry = (px - 0.5) * 2 * max;
                const rx = (0.5 - py) * 2 * max;
                card.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
                card.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
                card.style.setProperty('--glare-x', `${(px * 100).toFixed(1)}%`);
                card.style.setProperty('--glare-y', `${(py * 100).toFixed(1)}%`);
                card.style.setProperty('--glare-opacity', '1');
            });
        };

        const onLeave = () => {
            card.style.setProperty('--rx', '0deg');
            card.style.setProperty('--ry', '0deg');
            card.style.setProperty('--glare-opacity', '0');
        };

        card.addEventListener('pointermove', onMove, { passive: true });
        card.addEventListener('pointerleave', onLeave, { passive: true });
    }
}

/**
 * Subtle magnetic pull toward the cursor for elements matching `selector`.
 * @param {string} [selector='.hero-buttons .btn, .hero-social .social-link']
 * @param {Object} [options]
 * @param {number} [options.strength=0.35]
 */
export function initMagnetic(
    selector = '.hero-buttons .btn, .hero-social .social-link',
    { strength = 0.35 } = {}
) {
    if (!hasFinePointer || !canRunHeavyEffects()) {
        return;
    }
    const els = Array.from(document.querySelectorAll(selector));

    for (const el of els) {
        el.classList.add('magnetic');
        let rafId = 0;

        const onMove = (event) => {
            if (rafId) {
                return;
            }
            rafId = requestAnimationFrame(() => {
                rafId = 0;
                const rect = el.getBoundingClientRect();
                const mx = event.clientX - (rect.left + rect.width / 2);
                const my = event.clientY - (rect.top + rect.height / 2);
                el.style.setProperty('--mx', `${(mx * strength).toFixed(1)}px`);
                el.style.setProperty('--my', `${(my * strength).toFixed(1)}px`);
            });
        };

        const onLeave = () => {
            el.style.setProperty('--mx', '0px');
            el.style.setProperty('--my', '0px');
        };

        el.addEventListener('pointermove', onMove, { passive: true });
        el.addEventListener('pointerleave', onLeave, { passive: true });
    }
}

/**
 * Initialise all micro-interactions. Safe to call after dynamic content loads.
 */
export function initInteractions() {
    initCountUp();
    initTilt('.project-card');
    initTilt('.stat-card', { max: 6 });
    initMagnetic();
}
