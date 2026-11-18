import { describe, expect, it } from 'vitest';
import { parseDebugMode } from '../../modules/debug.js';

describe('parseDebugMode', () => {
    it('is off by default', () => {
        expect(parseDebugMode('')).toBe(false);
        expect(parseDebugMode('?lab=hero-gpu')).toBe(false);
    });

    it('turns on from the address, with or without a value', () => {
        expect(parseDebugMode('?debug')).toBe(true);
        expect(parseDebugMode('?debug=1')).toBe(true);
    });

    it('turns off with ?debug=0', () => {
        expect(parseDebugMode('?debug=0')).toBe(false);
    });
});
