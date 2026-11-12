/**
 * Where the browser finds the Worker: same-origin /api on the live site, the Worker's own
 * address everywhere else.
 */
import { describe, expect, it } from 'vitest';
import { WORKER_BASE, WORKER_ORIGIN, workerBase } from '../../modules/config.js';

describe('workerBase', () => {
    it.each(['andernet.dev', 'www.andernet.dev'])('is same-origin /api on %s', host => {
        expect(workerBase(host)).toBe('/api');
    });

    // Lookalike hosts must not get a relative URL that would call that host's own /api
    it.each([
        'localhost',
        '127.0.0.1',
        'and3rn3t.github.io',
        'andernet.dev.evil.com',
        'evilandernet.dev',
        'health.andernet.dev',
        '',
        undefined,
    ])('is the Worker address on %s', host => {
        expect(workerBase(host)).toBe(WORKER_ORIGIN);
    });

    it('has no trailing slash, so `${base}/views` is a single slash', () => {
        expect(WORKER_ORIGIN.endsWith('/')).toBe(false);
        expect(workerBase('andernet.dev').endsWith('/')).toBe(false);
    });
});

describe('WORKER_BASE', () => {
    // jsdom's page is localhost
    it('is the Worker address when the page is not on the site', () => {
        expect(WORKER_BASE).toBe(WORKER_ORIGIN);
    });
});
