import { describe, expect, it } from 'vitest';
import { buildCases, formatReport, grade, parseStream } from '../../scripts/mcp-eval.mjs';

const projects = {
    projects: [
        { name: 'bare' },
        { name: 'site', technologies: ['JavaScript', 'WebAssembly', 'Workers'] },
    ],
};
const posts = {
    posts: [
        { title: 'Older', date: '2026-01-01' },
        { title: 'Newest', date: '2026-11-01' },
    ],
};
const experience = {
    experience: [
        { company: 'Old Co', current: false },
        { company: 'Deere & Company', current: true },
    ],
};

describe('buildCases', () => {
    const cases = buildCases(projects, posts, experience);

    it('reads the expected answers from the data files', () => {
        const byId = Object.fromEntries(cases.map(testCase => [testCase.id, testCase]));
        expect(byId['current-employer'].expectAll).toEqual(['Deere']);
        expect(byId['newest-post'].expectAll).toEqual(['Newest']);
        expect(byId['post-count'].expectAll).toEqual(['2']);
        expect(byId['project-technologies'].question).toContain('"site"');
        expect(byId['project-technologies'].expectAll).toEqual(['JavaScript', 'WebAssembly']);
    });

    it('skips a case when the data has nothing to ask about', () => {
        const none = buildCases({ projects: [] }, { posts: [] }, { experience: [] });
        expect(none.map(testCase => testCase.id)).toEqual(['post-count', 'unknown-project']);
    });
});

describe('grade', () => {
    const testCase = { id: 'x', question: '?', expectAll: ['Deere'], tools: ['get_profile'] };

    it('passes when the facts are present and a listed tool ran', () => {
        const result = grade(testCase, {
            answer: 'He works at deere.',
            toolsCalled: ['get_profile'],
        });
        expect(result).toEqual({ pass: true, problems: [] });
    });

    it('names each thing that is wrong', () => {
        const result = grade(testCase, { answer: 'No idea.', toolsCalled: [] });
        expect(result.pass).toBe(false);
        expect(result.problems).toHaveLength(2);
    });

    it('needs one of expectAny', () => {
        const unknown = {
            id: 'u',
            question: '?',
            expectAll: [],
            expectAny: ['no such'],
            tools: ['get_project'],
        };
        expect(
            grade(unknown, { answer: 'There is no such project.', toolsCalled: ['get_project'] })
                .pass
        ).toBe(true);
        expect(grade(unknown, { answer: 'It is great.', toolsCalled: ['get_project'] }).pass).toBe(
            false
        );
    });
});

describe('parseStream', () => {
    it('collects portfolio tool names and the final answer, ignoring other lines', () => {
        const lines = [
            'not json',
            JSON.stringify({
                type: 'assistant',
                message: { content: [{ type: 'tool_use', name: 'mcp__portfolio__list_posts' }] },
            }),
            JSON.stringify({
                type: 'assistant',
                message: { content: [{ type: 'tool_use', name: 'Bash' }] },
            }),
            JSON.stringify({ type: 'result', result: 'Four.' }),
        ].join('\n');
        expect(parseStream(lines)).toEqual({ answer: 'Four.', toolsCalled: ['list_posts'] });
    });
});

describe('formatReport', () => {
    it('summarises and escapes table pipes', () => {
        const testCase = { id: 'a', question: '?', expectAll: [], tools: [] };
        const report = formatReport([
            { testCase, answer: 'x | y', toolsCalled: ['t'], pass: false, problems: ['bad'] },
        ]);
        expect(report).toContain('0/1 passed');
        expect(report).toContain('x \\| y');
        expect(report).toContain('❌');
    });
});
