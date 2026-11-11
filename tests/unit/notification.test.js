import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UIManager } from '../../modules/ui.js';

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

    it('creates an empty live region up front, so the first message is announced', () => {
        const region = ui.ensureNotificationRegion();

        // In the page, empty and hidden before any message is sent...
        expect(region.getAttribute('role')).toBe('status');
        expect(region.getAttribute('aria-live')).toBe('polite');
        expect(region.textContent).toBe('');
        expect(isVisible()).toBe(false);

        // ...and the same element is filled in afterwards, not replaced.
        ui.showNotification('You are offline', 'warning');
        expect(toast()).toBe(region);
        expect(region.textContent).toBe('You are offline');
        expect(document.querySelectorAll('#app-notification')).toHaveLength(1);
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
        expect(toast().className).toBe('toast toast--error visible');
        expect(toast().textContent).toBe('second');
        expect(document.querySelectorAll('#app-notification')).toHaveLength(1);
    });

    it.each([
        ['success', 'toast--success'],
        ['error', 'toast--error'],
        ['warning', 'toast--warning'],
        ['info', 'toast--info'],
        ['nonsense', 'toast--info'],
    ])('type %s uses the class %s', (type, expected) => {
        ui.showNotification('x', type);
        expect(toast().classList.contains(expected)).toBe(true);
    });

    // The toast's colours are design tokens in styles/home.css; tests/e2e/dialogs.spec.js measures
    // their contrast in both themes.
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
