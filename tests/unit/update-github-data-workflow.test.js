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
});
