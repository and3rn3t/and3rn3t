/**
 * ThemeManager: follows the OS until the visitor picks a theme, then remembers the choice, and
 * keeps <html data-theme>, the toggle button and the browser-bar colour in step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motion } from '../../modules/capabilities.js';
import { ThemeManager, initThemeManager } from '../../modules/theme.js';

const LIGHT = '#fbfbf8';
const DARK = '#0b0d0b';

/** A matchMedia whose dark-scheme answer and change listeners the test controls. */
function stubSystemTheme(initial) {
    const listeners = [];
    let dark = initial === 'dark';
    vi.stubGlobal('matchMedia', () => ({
        get matches() {
            return dark;
        },
        addEventListener: (_type, listener) => listeners.push(listener),
    }));
    return {
        change(next) {
            dark = next === 'dark';
            for (const listener of listeners) listener({ matches: dark });
        },
    };
}

const html = () => document.documentElement;
const metaColours = () =>
    [...document.querySelectorAll('meta[name="theme-color"]')].map(meta => meta.content);
const press = (key, init = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    document.dispatchEvent(event);
    return event;
};

describe('ThemeManager', () => {
    beforeEach(() => {
        localStorage.clear();
        delete html().dataset.theme;
        delete html().dataset.switchingTheme;
        document.head.innerHTML = '';
        document.body.innerHTML = `<button id="theme-toggle"><svg><use href="x#moon"></use></svg></button>`;
        motion.reduced = false;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete document.startViewTransition;
    });

    describe('first paint', () => {
        it('follows the OS setting when nothing is saved', () => {
            stubSystemTheme('dark');
            const theme = new ThemeManager();
            expect(theme.isDark()).toBe(true);
            expect(html().dataset.theme).toBe('dark');
        });

        it('uses the saved choice over the OS setting', () => {
            stubSystemTheme('dark');
            localStorage.setItem('theme', 'light');
            expect(new ThemeManager().currentTheme).toBe('light');
        });

        it('ignores a saved value that is not a theme', () => {
            stubSystemTheme('light');
            localStorage.setItem('theme', 'sepia');
            expect(new ThemeManager().currentTheme).toBe('light');
        });

        it('drops the old "follow system" flag along with any saved choice', () => {
            stubSystemTheme('dark');
            localStorage.setItem('theme', 'light');
            localStorage.setItem('followSystemTheme', 'true');
            const theme = new ThemeManager();
            expect(localStorage.getItem('followSystemTheme')).toBeNull();
            expect(localStorage.getItem('theme')).toBeNull();
            expect(theme.currentTheme).toBe('dark');
        });

        it('falls back to light when matchMedia is missing', () => {
            vi.stubGlobal('matchMedia', undefined);
            expect(new ThemeManager().currentTheme).toBe('light');
        });
    });

    describe('toggling', () => {
        it('switches theme, saves it and fires themeChanged', () => {
            stubSystemTheme('light');
            const theme = new ThemeManager();
            const seen = [];
            document.addEventListener('themeChanged', event => seen.push(event.detail.theme));

            theme.toggle();

            expect(html().dataset.theme).toBe('dark');
            expect(localStorage.getItem('theme')).toBe('dark');
            expect(seen).toEqual(['dark']);
        });

        it('toggles from the button', () => {
            stubSystemTheme('light');
            new ThemeManager();
            document.getElementById('theme-toggle').click();
            expect(html().dataset.theme).toBe('dark');
        });

        it('still switches when storage throws', () => {
            stubSystemTheme('light');
            const theme = new ThemeManager();
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
                throw new Error('blocked');
            });
            expect(() => theme.toggle()).not.toThrow();
            expect(theme.isDark()).toBe(true);
            vi.restoreAllMocks();
        });

        it('swaps the button label, tooltip and sprite icon', () => {
            stubSystemTheme('light');
            const theme = new ThemeManager();
            const button = document.getElementById('theme-toggle');
            expect(button.getAttribute('aria-label')).toBe('Switch to dark theme');
            expect(button.title).toBe('Switch to dark theme (T)');
            expect(button.querySelector('use').getAttribute('href')).toMatch(/#moon$/);

            theme.toggle();

            expect(button.getAttribute('aria-label')).toBe('Switch to light theme');
            expect(button.querySelector('use').getAttribute('href')).toMatch(/#sun$/);
        });

        it('works without a toggle button on the page', () => {
            stubSystemTheme('light');
            document.body.innerHTML = '';
            const theme = new ThemeManager();
            expect(() => theme.toggle()).not.toThrow();
            expect(theme.isDark()).toBe(true);
        });
    });

    describe('the T shortcut', () => {
        beforeEach(() => stubSystemTheme('light'));

        it('toggles on t and T', () => {
            const theme = new ThemeManager();
            expect(press('t').defaultPrevented).toBe(true);
            expect(theme.isDark()).toBe(true);
            press('T');
            expect(theme.isDark()).toBe(false);
        });

        it('ignores other keys and modifier chords', () => {
            const theme = new ThemeManager();
            press('x');
            press('t', { metaKey: true });
            press('t', { ctrlKey: true });
            press('t', { altKey: true });
            expect(theme.isDark()).toBe(false);
        });

        it('ignores keys typed into a field', () => {
            const theme = new ThemeManager();
            const input = document.createElement('input');
            document.body.append(input);
            input.focus();
            press('t');
            expect(theme.isDark()).toBe(false);
        });
    });

    describe('the OS setting changing', () => {
        it('is followed until the visitor chooses', () => {
            const system = stubSystemTheme('light');
            const theme = new ThemeManager();
            system.change('dark');
            expect(theme.currentTheme).toBe('dark');
        });

        it('is ignored once the visitor has chosen, even if storage failed', () => {
            const system = stubSystemTheme('light');
            const theme = new ThemeManager();
            theme.toggle();
            system.change('light');
            expect(theme.currentTheme).toBe('dark');
        });
    });

    describe('the browser-bar colour', () => {
        it('points every theme-color tag at the theme on screen', () => {
            stubSystemTheme('light');
            document.head.innerHTML = `
                <meta name="theme-color" media="(prefers-color-scheme: light)" content="#000000">
                <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000000">`;
            const theme = new ThemeManager();
            expect(metaColours()).toEqual([LIGHT, LIGHT]);
            theme.toggle();
            expect(metaColours()).toEqual([DARK, DARK]);
        });

        it('adds a tag when the page has none', () => {
            stubSystemTheme('dark');
            new ThemeManager();
            expect(metaColours()).toEqual([DARK]);
        });
    });

    describe('the view transition', () => {
        const stubTransition = () => {
            let finish;
            const startViewTransition = vi.fn(commit => {
                commit();
                return { finished: new Promise(resolve => (finish = resolve)) };
            });
            document.startViewTransition = startViewTransition;
            return { startViewTransition, finish: () => finish() };
        };

        it('animates a user toggle and clears its marker afterwards', async () => {
            stubSystemTheme('light');
            const theme = new ThemeManager();
            const { startViewTransition, finish } = stubTransition();
            // The reveal grows from the centre of the button (jsdom has no layout, so give it one)
            vi.spyOn(theme.button, 'getBoundingClientRect').mockReturnValue({
                left: 100,
                top: 20,
                width: 40,
                height: 40,
            });

            theme.toggle();

            expect(startViewTransition).toHaveBeenCalledOnce();
            expect(html().dataset.switchingTheme).toBe('');
            expect(html().style.getPropertyValue('--theme-x')).toBe('120px');
            expect(html().style.getPropertyValue('--theme-y')).toBe('40px');
            finish();
            await Promise.resolve();
            await Promise.resolve();
            expect(html().dataset.switchingTheme).toBeUndefined();
        });

        it('is skipped for reduced motion', () => {
            stubSystemTheme('light');
            motion.reduced = true;
            const theme = new ThemeManager();
            const { startViewTransition } = stubTransition();
            theme.toggle();
            expect(startViewTransition).not.toHaveBeenCalled();
            expect(theme.isDark()).toBe(true);
        });

        it('is skipped for the first paint', () => {
            stubSystemTheme('dark');
            const { startViewTransition } = stubTransition();
            new ThemeManager();
            expect(startViewTransition).not.toHaveBeenCalled();
        });
    });
});

describe('initThemeManager', () => {
    afterEach(() => vi.restoreAllMocks());

    it('returns a manager', () => {
        stubSystemTheme('light');
        expect(initThemeManager()).toBeInstanceOf(ThemeManager);
    });

    it('returns null, and logs, when setup throws', () => {
        stubSystemTheme('light');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(ThemeManager.prototype, 'init').mockImplementation(() => {
            throw new Error('boom');
        });
        expect(initThemeManager()).toBeNull();
        expect(console.error).toHaveBeenCalled();
    });
});
