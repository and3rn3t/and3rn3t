import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom replaces URL, so build the path with join rather than fileURLToPath(new URL(...))
const root = join(import.meta.dirname, '..', '..');
const read = file => readFileSync(join(root, file), 'utf8');

describe('update-github-data.yml', () => {
    const workflow = read('.github/workflows/update-github-data.yml');

    it('runs the fetch from a script file, not inline Python', () => {
        expect(workflow).toContain('run: python3 scripts/update-github-data.py');
        expect(workflow).not.toContain("python3 - <<'");
        expect(existsSync(join(root, 'scripts/update-github-data.py'))).toBe(true);
    });

    // The data script writes the files the later steps stage and hash.
    it('writes the files the workflow commits', () => {
        const script = read('scripts/update-github-data.py');
        expect(script).toContain("open('github-data.json', 'w'");
        expect(script).toContain("open('README.md', 'w'");
    });

    // pnpm's package cache needs pnpm first, so Node is set up once, after the conditional pnpm.
    it('sets Node up once, for both the OG renderer and the site generator', () => {
        expect(workflow.match(/uses: actions\/setup-node@/g)).toHaveLength(1);
        expect(workflow.indexOf('uses: pnpm/action-setup@')).toBeLessThan(
            workflow.indexOf('uses: actions/setup-node@')
        );
    });

    it('pins every action to a commit SHA', () => {
        const uses = [...workflow.matchAll(/uses: (\S+)/g)].map(match => match[1]);
        expect(uses.length).toBeGreaterThan(0);
        for (const action of uses) expect(action, action).toMatch(/@[0-9a-f]{40}$/);
    });

    // main requires checks, and GitHub starts no workflow for anything GITHUB_TOKEN pushes or opens,
    // so a PR made with it can never turn green (the refresh failed for three days this way).
    describe('the pull request', () => {
        it('is pushed and opened with DATA_REFRESH_TOKEN, never GITHUB_TOKEN', () => {
            expect(workflow).toMatch(
                /uses: actions\/checkout@[^\n]+\n\s+with:\n(?:[^\n]*\n)*?\s+token: \$\{\{ secrets\.DATA_REFRESH_TOKEN \}\}/
            );
            const commitStep = workflow.slice(workflow.indexOf('name: Commit GitHub data via PR'));
            expect(commitStep).toContain('GH_TOKEN: ${{ secrets.DATA_REFRESH_TOKEN }}');
            expect(commitStep).not.toContain('GITHUB_TOKEN');
        });

        it('runs the required checks: no [skip ci], and merges when they pass', () => {
            expect(workflow).not.toContain('[skip ci]');
            expect(workflow).toContain('gh pr merge "$PR" --auto --merge');
        });

        it('leaves the deploy to pages.yml, which the merge starts', () => {
            // A dispatch here would deploy main before the PR has merged
            expect(workflow).not.toContain('gh workflow run');
            expect(workflow).not.toContain('actions: write');
        });

        it('fails first, in seconds, when the token is missing', () => {
            const first = workflow.indexOf('- name:');
            expect(workflow.slice(first, first + 60)).toContain('Check that the token is set');
            expect(workflow).toContain('::error::DATA_REFRESH_TOKEN is not set');
        });
    });
});
