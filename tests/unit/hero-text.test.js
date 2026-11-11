import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stand-in for the IntersectionObserver-based helper so a test can scroll the hero away and back.
const visibility = { start: null, stop: null, cleanup: vi.fn(), autoStart: true };
vi.mock('../../modules/utils/while-visible.js', () => ({
    whileVisible: (_el, start, stop) => {
        visibility.start = start;
        visibility.stop = stop;
        if (visibility.autoStart) start(); // on screen from the beginning
        return visibility.cleanup;
    },
}));

const ROLES = ['Engineer', 'Tinkerer', 'Enthusiast'];
const HERO_HTML = `
    <h1 class="hero-title">Hi, I'm <span class="highlight">Matthew Anderson</span></h1>
    <h2 class="hero-subtitle">
        <span class="hero-role" data-roles="${ROLES.join('|')}">${ROLES[0]}</span><span class="hero-caret" aria-hidden="true"></span>
    </h2>`;

const nameEl = () => document.querySelector('.highlight');
const roleEl = () => document.querySelector('.hero-role');
const caret = () => document.querySelector('.hero-caret');
const hiddenCopies = () => [...document.querySelectorAll('.sr-only')].map(el => el.textContent);

describe('hero text effects', () => {
    let initHeroText;
    let motion;

    beforeEach(async () => {
        vi.useFakeTimers({
            toFake: [
                'setTimeout',
                'clearTimeout',
                'requestAnimationFrame',
                'cancelAnimationFrame',
                'performance',
            ],
        });
        document.body.innerHTML = HERO_HTML;
        visibility.cleanup = vi.fn();
        visibility.autoStart = true;
        vi.resetModules();
        ({ motion } = await import('../../modules/capabilities.js'));
        motion.reduced = false;
        ({ initHeroText } = await import('../../modules/hero-text.js'));
    });

    afterEach(() => {
        vi.useRealTimers();
        motion.reduced = false;
    });

    describe('the name (h1)', () => {
        it('is hidden from screen readers while it scrambles, with the real text offered instead', () => {
            initHeroText();

            expect(nameEl().getAttribute('aria-hidden')).toBe('true');
            expect(hiddenCopies()).toContain('Matthew Anderson');
            // The heading still reads sensibly: the visible greeting plus the stable copy.
            expect(document.querySelector('h1').textContent).toContain('Matthew Anderson');
        });

        it('goes back to plain text once it has settled', () => {
            initHeroText();

            vi.advanceTimersByTime(2000);

            expect(nameEl().textContent).toBe('Matthew Anderson');
            expect(nameEl().hasAttribute('aria-hidden')).toBe(false);
            expect(document.querySelector('h1 .sr-only')).toBeNull();
        });
    });

    describe('the rotating role (h2)', () => {
        const ONE_PASS_MS = 60_000; // far longer than a single pass needs

        it('is hidden from screen readers while it types, with the first role as stable text', () => {
            initHeroText();

            expect(roleEl().getAttribute('aria-hidden')).toBe('true');
            expect(hiddenCopies()).toContain(ROLES[0]);
        });

        it('runs one pass and then rests on the first role', () => {
            initHeroText();
            const shown = new Set();
            const record = () => shown.add(roleEl().textContent);

            for (let t = 0; t < ONE_PASS_MS; t += 25) {
                vi.advanceTimersByTime(25);
                record();
            }

            // It really did cycle through the other roles...
            expect(shown.has(ROLES[1])).toBe(true);
            expect(shown.has(ROLES[2])).toBe(true);
            // ...and then stopped on the first.
            expect(roleEl().textContent).toBe(ROLES[0]);
            vi.advanceTimersByTime(ONE_PASS_MS);
            expect(roleEl().textContent).toBe(ROLES[0]);
        });

        it('leaves no timers running and no extra markup once finished', () => {
            initHeroText();

            vi.advanceTimersByTime(ONE_PASS_MS);

            expect(vi.getTimerCount()).toBe(0);
            expect(roleEl().hasAttribute('aria-hidden')).toBe(false);
            expect(document.querySelectorAll('.sr-only')).toHaveLength(0);
            expect(visibility.cleanup).toHaveBeenCalled(); // stopped watching visibility too
        });

        it('stops the blinking caret when the typing stops', () => {
            initHeroText();
            expect(caret().classList.contains('is-done')).toBe(false);

            vi.advanceTimersByTime(ONE_PASS_MS);

            expect(caret().classList.contains('is-done')).toBe(true);
        });

        it('pauses while scrolled out of view and resumes where it left off', () => {
            initHeroText();
            vi.advanceTimersByTime(500);
            visibility.stop();
            const frozen = roleEl().textContent;

            vi.advanceTimersByTime(30_000);
            expect(roleEl().textContent).toBe(frozen);
            expect(vi.getTimerCount()).toBe(0);

            visibility.start();
            vi.advanceTimersByTime(ONE_PASS_MS);
            expect(roleEl().textContent).toBe(ROLES[0]);
            expect(caret().classList.contains('is-done')).toBe(true);
        });

        it('keeps the first role on screen until the hero is actually on screen', () => {
            // The real whileVisible starts from an observer callback, a frame or so later.
            visibility.autoStart = false;

            initHeroText();
            vi.advanceTimersByTime(5000);
            expect(roleEl().textContent).toBe(ROLES[0]); // not blanked, not typing

            visibility.start();
            vi.advanceTimersByTime(100);
            expect(roleEl().textContent).not.toBe(ROLES[0]); // now it is typing
        });
    });

    describe('with reduced motion', () => {
        it('shows the final text with no animation and no accessibility workarounds', () => {
            motion.reduced = true;

            initHeroText();

            expect(nameEl().textContent).toBe('Matthew Anderson');
            expect(roleEl().textContent).toBe(ROLES[0]);
            expect(vi.getTimerCount()).toBe(0);
            expect(document.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1); // the caret
            expect(document.querySelectorAll('.sr-only')).toHaveLength(0);
        });
    });

    it('does not animate a single role', () => {
        roleEl().dataset.roles = 'Only one';

        initHeroText();

        expect(roleEl().textContent).toBe('Only one');
        expect(roleEl().hasAttribute('aria-hidden')).toBe(false);
    });
});
