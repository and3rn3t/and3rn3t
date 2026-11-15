import { describe, expect, it } from 'vitest';
import { findIssues } from '../../scripts/check-copy.mjs';

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
