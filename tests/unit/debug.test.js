import { describe, expect, it } from 'vitest';
import { parseDebugMode } from '../../modules/debug.js';

describe('parseDebugMode', () => {
    it('is off by default', () => {
        expect(parseDebugMode('', null)).toBe(false);
        expect(parseDebugMode('?lab=hero-gpu', null)).toBe(false);
    });

    it('turns on from the address, with or without a value', () => {
        expect(parseDebugMode('?debug', null)).toBe(true);
        expect(parseDebugMode('?debug=1', null)).toBe(true);
    });

    it('remembers a saved choice', () => {
        expect(parseDebugMode('', '1')).toBe(true);
    });

    it('lets ?debug=0 override a saved choice', () => {
        expect(parseDebugMode('?debug=0', '1')).toBe(false);
    });
});
