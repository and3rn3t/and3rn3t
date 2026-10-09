import { test, expect, vi, beforeEach } from 'vitest';
import { errorHandler } from '../../modules/error-handler.js';

vi.mock('../../modules/debug.js', () => ({
    debug: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const showNotification = vi.fn();

beforeEach(() => {
    showNotification.mockClear();
    globalThis.appState = { managers: { ui: { showNotification } } };
});

test('network and API errors reach the visitor when showUser is true', () => {
    // These used to be swallowed by a fallback strategy that returned null.
    errorHandler.handle(new Error('Failed to fetch'));
    errorHandler.handle(Object.assign(new Error('Resource not found'), { status: 404 }));
    expect(showNotification).toHaveBeenCalledTimes(2);
    expect(showNotification.mock.calls[0][0]).toMatch(/connect/);
    expect(showNotification.mock.calls[1][0]).toMatch(/loading data/);
});

test('showUser: false only logs', () => {
    errorHandler.handle(new Error('boom'), { showUser: false });
    expect(showNotification).not.toHaveBeenCalled();
});

test('does not throw before the UI manager exists', () => {
    globalThis.appState = { managers: {} };
    expect(() => errorHandler.handle(new Error('early'))).not.toThrow();
});
