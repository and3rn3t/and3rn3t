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
    const { length } = finalText;
    const start = performance.now();
    // Each character settles at a staggered point in the timeline.
    const settleAt = Array.from({ length }, (_, i) => 0.3 + (i / length) * 0.6);

    function frame(now) {
        const progress = Math.min((now - start) / duration, 1);
        let output = '';
        for (let i = 0; i < length; i++) {
            const char = finalText[i];
            if (char === ' ') {
                output += ' ';
            } else if (progress >= settleAt[i]) {
                output += char;
            } else {
                output += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            }
        }
        el.textContent = output;
        if (progress < 1) {
            requestAnimationFrame(frame);
        } else {
            el.textContent = finalText;
        }
    }
    requestAnimationFrame(frame);
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
            roleEl.textContent = '';
            rotateRoles(roleEl, roles);
        }
    }
}
