import { test, expect, beforeEach, vi } from 'vitest';

// jsdom provides matchMedia stubs but they return false by default,
// which represents the "no preference" state — good baseline for testing.

let capabilities;

beforeEach(async () => {
    vi.resetModules();
    capabilities = await import('../../modules/capabilities.js');
});

// ── matchMedia fallback (no-browser context) ─────────────────────────────────

test('canRunHeavyEffects returns a boolean', () => {
    expect(typeof capabilities.canRunHeavyEffects()).toBe('boolean');
});

test('canRunHeavyEffects is false when motion.reduced is true', () => {
    capabilities.motion.reduced = true;
    expect(capabilities.canRunHeavyEffects()).toBe(false);
    capabilities.motion.reduced = false; // restore
});

// ── onReducedMotionChange ────────────────────────────────────────────────────

test('onReducedMotionChange returns an unsubscribe function', () => {
    const unsub = capabilities.onReducedMotionChange(() => {});
    expect(typeof unsub).toBe('function');
    unsub(); // must not throw
});

test('onReducedMotionChange updates motion.reduced when MQ fires', () => {
    // jsdom exposes a basic matchMedia implementation; we simulate the change event.
    let listener;
    const fakeMQ = {
        matches: false,
        addEventListener: (_name, fn) => { listener = fn; },
        removeEventListener: vi.fn(),
    };
    const origMM = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn(() => fakeMQ);
    vi.resetModules();

    const cb = vi.fn();
    const mod = { onReducedMotionChange: capabilities.onReducedMotionChange };
    mod.onReducedMotionChange(cb);

    if (listener) {
        listener({ matches: true });
        expect(capabilities.motion.reduced).toBe(true);
        expect(cb).toHaveBeenCalledWith(true);
    }

    globalThis.matchMedia = origMM;
    capabilities.motion.reduced = false;
});

// ── prefersReducedData / isLowEndDevice / hasFinePointer ────────────────────

test('prefersReducedData is a boolean', () => {
    expect(typeof capabilities.prefersReducedData).toBe('boolean');
});

test('isLowEndDevice is a boolean', () => {
    expect(typeof capabilities.isLowEndDevice).toBe('boolean');
});

test('hasFinePointer is a boolean', () => {
    expect(typeof capabilities.hasFinePointer).toBe('boolean');
});

test('supportsWebGL is a boolean', () => {
    expect(typeof capabilities.supportsWebGL).toBe('boolean');
});
