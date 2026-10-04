/**
 * Hero Text Effects
 *
 * 1. Scramble-decode reveal for the hero name.
 * 2. Rotating role subtitle with a typewriter + caret.
 *
 * Both honour prefers-reduced-motion: when reduced motion is set, text simply
 * renders in its final state with no animation.
 *
 * @author Matthew Anderson
 */

import { motion } from './capabilities.js';

const SCRAMBLE_CHARS = String.raw`!<>-_/[]{}—=+*^?#________`;

/**
 * Animate a scramble→settle reveal of an element's text.
 * @param {HTMLElement} el
 * @param {string} finalText
 * @param {number} [duration=1100] total ms
 */
function scrambleReveal(el, finalText, duration = 1100) {
    const chars = Array.from(finalText);
    // Scramble glyphs are narrower than the real name, which would reflow the
    // centred heading every frame (layout shift). Give each glyph a fixed-width
    // cell measured from the final text, hold the heading's height, and restore
    // plain text once everything has settled.
    const block = el.closest('h1, h2, p') ?? el;
    block.style.minHeight = `${block.offsetHeight}px`;
    el.textContent = '';
    // Cells sit in a nowrap span per word so lines still only break at spaces.
    let word = null;
    const cells = chars.map(char => {
        if (char === ' ') {
            el.append(' ');
            word = null;
            return null;
        }
        if (!word) {
            word = document.createElement('span');
            word.style.whiteSpace = 'nowrap';
            el.append(word);
        }
        const cell = document.createElement('span');
        cell.textContent = char;
        word.append(cell);
        return cell;
    });
    const widths = cells.map(cell => cell?.getBoundingClientRect().width ?? 0);
    cells.forEach((cell, i) => {
        if (!cell) return;
        cell.style.display = 'inline-block';
        cell.style.width = `${widths[i]}px`;
        cell.style.textAlign = 'center';
    });

    const start = performance.now();
    // Each character settles at a staggered point in the timeline.
    const settleAt = chars.map((_, i) => 0.3 + (i / chars.length) * 0.6);

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        cells.forEach((cell, i) => {
            if (!cell) return;
            cell.textContent =
                progress >= settleAt[i]
                    ? chars[i]
                    : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        });
        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            el.textContent = finalText;
            block.style.minHeight = '';
        }
    }
    requestAnimationFrame(frame);
}

/**
 * Reserve enough height on `container` for the tallest role, so typing and
 * deleting (which wraps lines at narrow widths) never shifts the layout below.
 * @param {HTMLElement} container
 * @param {HTMLElement} roleEl
 * @param {string[]} roles
 */
function reserveRoleHeight(container, roleEl, roles) {
    const measure = () => {
        const current = roleEl.textContent;
        container.style.minHeight = '';
        let tallest = 0;
        for (const role of roles) {
            roleEl.textContent = role;
            tallest = Math.max(tallest, container.offsetHeight);
        }
        roleEl.textContent = current;
        container.style.minHeight = `${tallest}px`;
    };
    measure();

    let frame = 0;
    globalThis.addEventListener('resize', () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(measure);
    });
}

/**
 * Rotating typewriter for a list of roles.
 * @param {HTMLElement} el
 * @param {string[]} roles
 */
function rotateRoles(el, roles) {
    let roleIndex = 0;
    let charIndex = 0;
    let deleting = false;

    const TYPE_SPEED = 55;
    const DELETE_SPEED = 30;
    const HOLD = 1800;

    function tick() {
        const current = roles[roleIndex];
        if (deleting) {
            charIndex--;
        } else {
            charIndex++;
        }
        el.textContent = current.slice(0, charIndex);

        let delay = deleting ? DELETE_SPEED : TYPE_SPEED;

        if (!deleting && charIndex === current.length) {
            delay = HOLD;
            deleting = true;
        } else if (deleting && charIndex === 0) {
            deleting = false;
            roleIndex = (roleIndex + 1) % roles.length;
            delay = 400;
        }
        setTimeout(tick, delay);
    }
    tick();
}

/**
 * Wire up hero text effects.
 * @param {Object} [options]
 * @param {string} [options.nameSelector='.hero-title .highlight']
 * @param {string} [options.roleSelector='[data-roles]']
 */
export function initHeroText({
    nameSelector = '.hero-title .highlight',
    roleSelector = '[data-roles]',
} = {}) {
    const nameEl = document.querySelector(nameSelector);
    const roleEl = document.querySelector(roleSelector);

    if (nameEl && !motion.reduced) {
        const finalText = nameEl.textContent.trim();
        scrambleReveal(nameEl, finalText);
    }

    if (roleEl) {
        const roles = (roleEl.dataset.roles || '')
            .split('|')
            .map(r => r.trim())
            .filter(Boolean);
        if (roles.length === 0) {
            return;
        }
        if (motion.reduced) {
            roleEl.textContent = roles[0];
        } else {
            reserveRoleHeight(roleEl.parentElement ?? roleEl, roleEl, roles);
            roleEl.textContent = '';
            rotateRoles(roleEl, roles);
        }
    }
}
