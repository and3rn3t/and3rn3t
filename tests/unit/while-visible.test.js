import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { whileVisible } from '../../modules/utils/while-visible.js';

let notify;

beforeEach(() => {
    globalThis.IntersectionObserver = class {
        constructor(callback, _options) {
            notify = isIntersecting => callback([{ isIntersecting }]);
        }
        observe() {}
        disconnect() {}
    };
});

afterEach(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

function setHidden(hidden) {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
}

test('starts only once the element is on screen', () => {
    const start = vi.fn();
    whileVisible(document.createElement('canvas'), start, vi.fn());
    expect(start).not.toHaveBeenCalled();
    notify(true);
    expect(start).toHaveBeenCalledTimes(1);
});

test('returning to a hidden tab does not restart an offscreen element', () => {
    const start = vi.fn();
    const stop = vi.fn();
    whileVisible(document.createElement('canvas'), start, stop);
    notify(true);
    setHidden(true);
    notify(false); // scrolled away while the tab was in the background
    start.mockClear();
    setHidden(false);
    expect(start).not.toHaveBeenCalled();
});

test('restarts when the tab returns and the element is still on screen', () => {
    const start = vi.fn();
    const stop = vi.fn();
    whileVisible(document.createElement('canvas'), start, stop);
    notify(true);
    setHidden(true);
    expect(stop).toHaveBeenCalledTimes(1);
    setHidden(false);
    expect(start).toHaveBeenCalledTimes(2);
});

test('stops an element that starts offscreen, even if the caller started it first', () => {
    const stop = vi.fn();
    whileVisible(document.createElement('canvas'), vi.fn(), stop);
    notify(false);
    expect(stop).toHaveBeenCalledTimes(1);
});
