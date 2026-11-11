import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { UIManager } from '../../modules/ui.js';

// (jsdom replaces URL, which node:url's fileURLToPath rejects, so build the path directly)
const css = readFileSync(join(import.meta.dirname, '../../styles.css'), 'utf8');

const toast = () => document.getElementById('app-notification');
const isVisible = () => toast().classList.contains('visible');

describe('showNotification', () => {
    let ui;

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
        ui = new UIManager();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows a message in a polite live region and hides it after the duration', () => {
        ui.showNotification('You are offline', 'warning', 5000);

        expect(toast().getAttribute('role')).toBe('status');
        expect(toast().getAttribute('aria-live')).toBe('polite');
        expect(toast().textContent).toBe('You are offline');
        expect(isVisible()).toBe(true);

        vi.advanceTimersByTime(5001);
        expect(isVisible()).toBe(false);
    });

    it('keeps the live region in the page, emptied, once the toast has faded', () => {
        ui.showNotification('Saved', 'success', 1000);

        vi.advanceTimersByTime(1000 + 400);

        expect(toast()).not.toBeNull(); // so the next message is announced
        expect(toast().textContent).toBe('');
        expect(isVisible()).toBe(false);
    });

    it('lets a later message outlive an earlier, shorter one', () => {
        ui.showNotification('first', 'info', 5000);
        vi.advanceTimersByTime(2000);
        ui.showNotification('second', 'success', 8000);

        // The first message's timer would have fired at 5000ms and hidden the second one.
        vi.advanceTimersByTime(4000); // t = 6000
        expect(isVisible()).toBe(true);
        expect(toast().textContent).toBe('second');

        vi.advanceTimersByTime(4001); // t = 10001, past the second message's 8000ms
        expect(isVisible()).toBe(false);
    });

    it('does not blank a newer message when an older toast finishes fading', () => {
        ui.showNotification('first', 'info', 1000);
        vi.advanceTimersByTime(1100); // first has started to fade and its text-clear is pending
        ui.showNotification('second', 'info', 5000);

        vi.advanceTimersByTime(500);

        expect(toast().textContent).toBe('second');
        expect(isVisible()).toBe(true);
    });

    it('swaps the message in place: same element, still visible, new variant', () => {
        ui.showNotification('first', 'info', 5000);
        const element = toast();

        ui.showNotification('second', 'error', 5000);

        expect(toast()).toBe(element);
        expect(toast().className).toBe('app-toast app-toast--error visible');
        expect(toast().textContent).toBe('second');
        expect(document.querySelectorAll('#app-notification')).toHaveLength(1);
    });

    it.each([
        ['success', 'app-toast--success'],
        ['error', 'app-toast--error'],
        ['warning', 'app-toast--warning'],
        ['info', 'app-toast--info'],
        ['nonsense', 'app-toast--info'],
    ])('type %s uses the class %s', (type, expected) => {
        ui.showNotification('x', type);
        expect(toast().classList.contains(expected)).toBe(true);
    });

    it('does not set colours or sizes inline (they belong in the stylesheet)', () => {
        ui.showNotification('x', 'error');
        expect(toast().getAttribute('style')).toBeNull();
    });

    it('treats the message as text, never as HTML', () => {
        ui.showNotification('<img src=x onerror=alert(1)>', 'info');
        expect(toast().querySelector('img')).toBeNull();
        expect(toast().textContent).toBe('<img src=x onerror=alert(1)>');
    });
});

describe('toast colours meet WCAG AA with white text', () => {
    const luminance = hex => {
        const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
        const lin = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const contrastWithWhite = hex => 1.05 / (luminance(hex) + 0.05);
    // The first definition is the :root (light) one, which the toast uses in both themes.
    const token = name => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    const backgroundOf = selector =>
        css.match(new RegExp(`${selector}\\s*{[^}]*?background:\\s*var\\(--([\\w-]+)\\)`))?.[1];

    it.each(['.app-toast', '.app-toast--success', '.app-toast--error', '.app-toast--warning'])(
        '%s background is readable',
        selector => {
            const name = backgroundOf(selector.replace('.', '\\.'));
            expect(name, `${selector} should use a semantic token`).toBeDefined();
            const hex = token(name);
            expect(hex, `--${name} should be a hex colour`).toBeDefined();
            expect(contrastWithWhite(hex)).toBeGreaterThanOrEqual(4.5);
        }
    );
});
