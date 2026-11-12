import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatReceipt, initEdgeReceipt } from '../../modules/edge.js';

describe('formatReceipt', () => {
    it('says where it was served, how long the API took and which Worker', () => {
        expect(formatReceipt({ colo: 'ORD', version: 'abc1234' }, 37.6)).toBe(
            'Served from ORD · API 38 ms · Worker abc1234'
        );
    });

    it('leaves out a version it does not have, and never shows 0 ms', () => {
        expect(formatReceipt({ colo: 'ORD', version: null }, 0.2)).toBe(
            'Served from ORD · API 1 ms'
        );
    });

    it('says nothing without a location (local dev has none)', () => {
        expect(formatReceipt({ colo: null, version: 'abc' }, 20)).toBe('');
        expect(formatReceipt(undefined, 20)).toBe('');
        expect(formatReceipt({ colo: 'ORD' }, Number.NaN)).toBe('');
    });
});

describe('initEdgeReceipt', () => {
    beforeEach(() => {
        document.body.innerHTML =
            '<span data-edge-widget hidden><span data-edge-receipt></span></span>';
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const widget = () => document.querySelector('[data-edge-widget]');

    it('fills the line and shows the widget', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ colo: 'ORD', version: 'abc1234' }))
        );
        await initEdgeReceipt();
        expect(document.querySelector('[data-edge-receipt]').textContent).toMatch(
            /^Served from ORD · API \d+ ms · Worker abc1234$/
        );
        expect(widget().hidden).toBe(false);
    });

    it.each([
        ['an error status', () => new Response('{}', { status: 503 })],
        ['no location', () => Response.json({ colo: null })],
    ])('stays hidden on %s', async (_name, reply) => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => reply())
        );
        await initEdgeReceipt();
        expect(widget().hidden).toBe(true);
    });

    it('stays hidden when the request fails, and does not throw', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Promise.reject(new Error('offline')))
        );
        await expect(initEdgeReceipt()).resolves.toBeUndefined();
        expect(widget().hidden).toBe(true);
    });

    it('does nothing on a page with no slot', async () => {
        document.body.innerHTML = '';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        await initEdgeReceipt();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
