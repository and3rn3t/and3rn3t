/**
 * The daily data workflow runs the generator and commits what it writes; `pnpm check:generated`
 * (Quality on PRs, the `verify` job in pages.yml) fails the build if the generator leaves a diff.
 * If the workflow stages less than the check covers, the data PR commits stale generated files
 * and the next check fails.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { GENERATED_PATHS } from '../../scripts/check-generated.mjs';

const read = file => readFileSync(file, 'utf8');

const checkedPaths = () => GENERATED_PATHS;

/** Paths staged by the data workflow's `git add`, with its line continuations joined. */
const stagedPaths = () => {
    const joined = read('.github/workflows/update-github-data.yml').replaceAll(/\\\n\s*/g, ' ');
    const match = joined.match(/^\s*git add ([^\n]+)$/m);
    return match[1].trim().split(/\s+/);
};

describe('generated files', () => {
    it('the check covers the generator output', () => {
        expect(checkedPaths()).toEqual(
            expect.arrayContaining([
                'posts',
                'projects',
                'status',
                'sitemap.xml',
                'llms.txt',
                'index.html',
                '404.html',
            ])
        );
    });

    it('Quality and the deploy gate run the same check', () => {
        const command = /command: (?:>-\s*)?(pnpm validate && pnpm check:generated)\s*$/m;
        expect(read('.github/workflows/quality.yml')).toMatch(command);
        expect(read('.github/workflows/pages.yml')).toMatch(command);
    });

    it('the data workflow stages every path the check covers (or a folder inside it)', () => {
        const staged = stagedPaths();
        for (const path of checkedPaths()) {
            const covered = staged.some(
                entry => entry === path || entry.replace(/\/$/, '').startsWith(`${path}/`)
            );
            expect(covered, `${path} is checked by check-generated.mjs but not staged`).toBe(true);
        }
    });
});
