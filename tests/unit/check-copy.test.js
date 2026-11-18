import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOURCES, findIssues } from '../../scripts/check-copy.mjs';

describe('findIssues', () => {
    it('finds pronouns with file and line', () => {
        const issues = findIssues('a.txt', 'Fine line.\nWhere to find him, and his work.');
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ file: 'a.txt', line: 2, found: ['him', 'his'] });
    });

    it('does not match inside other words', () => {
        expect(findIssues('a.txt', 'the, other, there, hero, shell, Matthew')).toEqual([]);
    });
});

describe('SOURCES', () => {
    // The MCP server's descriptions are words agents read; a file split out of worker/mcp.js
    // must be scanned too, or the check stops covering what moved.
    it('lists every file in worker/mcp/', () => {
        const dir = join(import.meta.dirname, '..', '..', 'worker', 'mcp');
        for (const name of readdirSync(dir)) {
            expect(SOURCES, `worker/mcp/${name} is not scanned`).toContain(`worker/mcp/${name}`);
        }
    });
});
