import { describe, expect, it, vi } from 'vitest';
import { GENERATED_PATHS, checkGenerated } from '../../scripts/check-generated.mjs';

/** A runner that records every call and answers `git status` with the given porcelain text. */
const runner = (porcelain, stat = '') =>
    vi.fn((command, args) => {
        if (command === 'git' && args[0] === 'status') return porcelain;
        if (command === 'git' && args[0] === 'diff') return stat;
        return '';
    });

describe('checkGenerated', () => {
    it('regenerates first, then asks git about exactly the generated paths', () => {
        const run = runner('');
        checkGenerated(run);
        expect(run.mock.calls[0]).toEqual(['node', ['scripts/generate-site.mjs']]);
        expect(run.mock.calls[1]).toEqual([
            'git',
            ['status', '--porcelain', '--', ...GENERATED_PATHS],
        ]);
    });

    it('passes when git reports nothing', () => {
        const run = runner('\n');
        const result = checkGenerated(run);
        expect(result.ok).toBe(true);
        expect(result.report).toContain('up to date');
        expect(run).toHaveBeenCalledTimes(2);
    });

    it('fails on a tracked file that changed', () => {
        const result = checkGenerated(runner(' M index.html\n', ' index.html | 2 +-'));
        expect(result.ok).toBe(false);
        expect(result.report).toContain(' M index.html');
        expect(result.report).toContain('index.html | 2 +-');
        expect(result.report).toContain('node scripts/generate-site.mjs');
    });

    // `git diff` ignores untracked files, which is why this uses `git status`: a page the
    // generator now writes but nobody committed must still fail the check.
    it('fails on an untracked generated file', () => {
        const result = checkGenerated(runner('?? posts/new-post/index.html\n'));
        expect(result.ok).toBe(false);
        expect(result.report).toContain('?? posts/new-post/index.html');
    });

    it('does not swallow a generator failure', () => {
        const run = vi.fn(() => {
            throw new Error('generate-site crashed');
        });
        expect(() => checkGenerated(run)).toThrow('generate-site crashed');
    });
});
