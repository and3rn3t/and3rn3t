import { describe, expect, it } from 'vitest';
import { needsReseed } from '../../modules/wasm/hero-sim.js';

describe('needsReseed', () => {
    const was = { width: 800, height: 600 };

    it('keeps the field when only a phone URL bar changes the height a little', () => {
        expect(needsReseed(was, { width: 800, height: 560 })).toBe(false);
        expect(needsReseed(was, { width: 800.4, height: 640 })).toBe(false);
    });

    it('re-seeds when the width changes (rotation, a resized window)', () => {
        expect(needsReseed(was, { width: 600, height: 600 })).toBe(true);
    });

    it('re-seeds when the height alone changes the area by more than a fifth', () => {
        expect(needsReseed(was, { width: 800, height: 400 })).toBe(true);
    });

    it('re-seeds when there was no area to compare', () => {
        expect(needsReseed({ width: 0, height: 0 }, was)).toBe(true);
    });
});
