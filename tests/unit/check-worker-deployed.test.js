import { describe, expect, it, vi } from 'vitest';
import { evaluateDeploy, fetchVersion } from '../../scripts/check-worker-deployed.mjs';

const NEWEST = 'a'.repeat(40);

/** A history where only the listed refs resolve, and `containing` are the refs that include NEWEST. */
const history = ({ newest = NEWEST, known = [], containing = [] } = {}) => ({
    lastWorkerCommit: () => newest,
    resolve: ref => (known.includes(ref) ? `full-${ref}` : null),
    isAncestor: (_ancestor, descendant) => containing.some(ref => `full-${ref}` === descendant),
});

describe('evaluateDeploy', () => {
    it('is current when the deployed commit contains the last Worker change', () => {
        const result = evaluateDeploy(
            'abc1234',
            history({ known: ['abc1234'], containing: ['abc1234'] })
        );
        expect(result.status).toBe('current');
    });

    it('is behind when the deployed commit predates it', () => {
        const result = evaluateDeploy('abc1234', history({ known: ['abc1234'] }));
        expect(result.status).toBe('behind');
        expect(result.message).toContain('merged, not deployed');
    });

    it('is unknown for an untagged version id, which is not a commit', () => {
        expect(evaluateDeploy('1d1c0f1c', history()).status).toBe('unknown');
    });

    it('is unknown when /api/edge names no version, or no commit touches the Worker', () => {
        expect(evaluateDeploy(null, history()).status).toBe('unknown');
        expect(evaluateDeploy('abc1234', history({ newest: null })).status).toBe('unknown');
    });
});

describe('fetchVersion', () => {
    const answer = (body, ok = true, status = 200) =>
        vi.fn().mockResolvedValue({ ok, status, json: async () => body });

    it('reads the version field', async () => {
        expect(await fetchVersion('https://x.test', answer({ version: 'abc1234' }))).toBe(
            'abc1234'
        );
    });

    it('is null when the field is missing or not text', async () => {
        expect(await fetchVersion('https://x.test', answer({ version: 5 }))).toBeNull();
        expect(await fetchVersion('https://x.test', answer({}))).toBeNull();
    });

    it('throws on an error status', async () => {
        await expect(fetchVersion('https://x.test', answer({}, false, 503))).rejects.toThrow(
            'HTTP 503'
        );
    });
});
