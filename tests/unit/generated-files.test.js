/**
 * The daily data workflow runs the generator and commits what it writes; Quality fails the build
 * if the generator leaves a diff. If the workflow stages less than Quality checks, the data PR
 * commits stale generated files and the next PR's check fails.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = file => readFileSync(file, 'utf8');

/** Paths named by Quality's `git diff --exit-code -- <paths>`. */
const checkedPaths = () => {
    const match = read('.github/workflows/quality.yml').match(/git diff --exit-code -- ([^\n]+)/);
    return match[1].trim().split(/\s+/);
};

/** Paths staged by the data workflow's `git add`, with its line continuations joined. */
const stagedPaths = () => {
    const joined = read('.github/workflows/update-github-data.yml').replaceAll(/\\\n\s*/g, ' ');
    const match = joined.match(/^\s*git add ([^\n]+)$/m);
    return match[1].trim().split(/\s+/);
};

describe('generated files', () => {
    it('Quality checks the generator output', () => {
        expect(checkedPaths()).toEqual(
            expect.arrayContaining([
                'posts',
                'projects',
                'sitemap.xml',
                'llms.txt',
                'index.html',
                '404.html',
            ])
        );
    });

    it('the data workflow stages every path Quality checks (or a folder inside it)', () => {
        const staged = stagedPaths();
        for (const path of checkedPaths()) {
            const covered = staged.some(
                entry => entry === path || entry.replace(/\/$/, '').startsWith(`${path}/`)
            );
            expect(covered, `${path} is checked by quality.yml but not staged`).toBe(true);
        }
    });
});
