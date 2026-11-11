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
import { whileVisible } from './utils/while-visible.js';

const SCRAMBLE_CHARS = String.raw`!<>-_/[]{}—=+*^?#________`;

/**
 * Hide animated text from assistive technology and offer the real text in its place, so a
 * screen reader never reads random glyphs or half-typed words.
 * @param {HTMLElement} el - the element whose text animates
 * @param {string} text - what it should read as
 * @returns {() => void} undo, for when the animation has settled on the real text
 */
function hideFromScreenReaders(el, text) {
    const stable = document.createElement('span');
    stable.className = 'sr-only';
    stable.textContent = text;
    el.setAttribute('aria-hidden', 'true');
    el.after(stable);
    return () => {
        el.removeAttribute('aria-hidden');
        stable.remove();
    };
}

/**
 * Animate a scramble→settle reveal of an element's text.
 * @param {HTMLElement} el
 * @param {string} finalText
 * @param {number} [duration=1100] total ms
 */
function scrambleReveal(el, finalText, duration = 1100) {
    const chars = Array.from(finalText);
    const restoreA11y = hideFromScreenReaders(el, finalText);
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
            restoreA11y();
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
 * Typewriter pass through a list of roles: type each, hold, delete it, and finally type the
 * first role again and stop there. It runs once, not forever, so it never becomes a
 * permanently moving element; it can be paused and resumed (see whileVisible below).
 * @param {HTMLElement} el
 * @param {string[]} roles - at least two
 * @param {{ onDone?: () => void }} [options]
 * @returns {{ start: () => void, stop: () => void }}
 */
function rotateRoles(el, roles, { onDone } = {}) {
    let roleIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let finishedRoles = 0; // roles typed and deleted so far
    let timer = 0;
    let started = false;
    let done = false;

    const TYPE_SPEED = 55;
    const DELETE_SPEED = 30;
    const HOLD = 1800;
    const GAP = 400;

    function tick() {
        timer = 0;
        const current = roles[roleIndex];
        charIndex += deleting ? -1 : 1;
        el.textContent = current.slice(0, charIndex);

        let delay = deleting ? DELETE_SPEED : TYPE_SPEED;

        if (!deleting && charIndex === current.length) {
            if (finishedRoles === roles.length) {
                // Back on the first role after one full pass: leave it on screen.
                done = true;
                onDone?.();
                return;
            }
            delay = HOLD;
            deleting = true;
        } else if (deleting && charIndex === 0) {
            deleting = false;
            roleIndex = (roleIndex + 1) % roles.length;
            finishedRoles++;
            delay = GAP;
        }
        timer = setTimeout(tick, delay);
    }

    return {
        start() {
            if (done || timer) return;
            if (started) {
                timer = setTimeout(tick, TYPE_SPEED); // resume where it left off
                return;
            }
            started = true;
            el.textContent = '';
            tick();
        },
        stop() {
            clearTimeout(timer);
            timer = 0;
        },
    };
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
        if (motion.reduced || roles.length < 2) {
            roleEl.textContent = roles[0];
        } else {
            reserveRoleHeight(roleEl.parentElement ?? roleEl, roleEl, roles);
            const restoreA11y = hideFromScreenReaders(roleEl, roles[0]);
            const caret = roleEl.parentElement?.querySelector('.hero-caret');
            let stopWatching = () => {};
            const rotation = rotateRoles(roleEl, roles, {
                onDone: () => {
                    restoreA11y();
                    caret?.classList.add('is-done'); // an endlessly blinking caret is motion too
                    stopWatching();
                },
            });
            // Only animate while the hero is on screen and the tab is visible.
            stopWatching = whileVisible(roleEl, rotation.start, rotation.stop);
        }
    }
}
