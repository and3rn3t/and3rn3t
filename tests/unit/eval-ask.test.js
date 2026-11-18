import { describe, expect, it } from 'vitest';
import { buildEntries } from '../../modules/ask.js';
import {
    buildQuestions,
    countLabel,
    msLabel,
    printable,
    readResults,
    score,
    summarize,
} from '../../scripts/eval-ask.mjs';

const PROJECTS = {
    projects: [
        {
            name: 'health',
            displayName: 'Health Analytics',
            description: 'Gait analysis with iPhone LiDAR sensors on device',
            technologies: ['Swift', 'LiDAR', 'Shared'],
        },
        {
            name: 'homehub',
            description: 'A home dashboard that runs without the cloud entirely',
            technologies: ['React', 'Shared'],
        },
        {
            name: 'weather',
            description: 'A weather app for iOS and Android with fastlane',
            technologies: ['Expo'],
        },
        {
            name: 'network',
            description: 'UniFi network monitoring with a Python backend',
            technologies: ['Python'],
        },
        {
            name: 'guess',
            description: 'A twenty questions game that shows its reasoning',
            technologies: ['TypeScript'],
        },
        {
            name: 'dbt',
            description: 'Analytics workspace with dbt transforms and notebooks',
            technologies: ['SQL'],
        },
        {
            name: 'one',
            description: 'A small tool that does the first thing very well indeed',
            technologies: ['Go'],
        },
        {
            name: 'two',
            description: 'A second tool that handles the other thing without fuss',
            technologies: ['Rust'],
        },
        {
            name: 'three',
            description: 'Notes on a third idea that never quite shipped anywhere',
            technologies: ['Lua'],
        },
    ],
};
const POSTS = {
    posts: [
        { slug: 'agent-ready', title: 'Agent-ready', tags: ['MCP', 'Workers'] },
        { slug: 'how-it-works', title: 'How it works', tags: ['Workers', 'CSS'] },
    ],
};
const questions = buildQuestions(PROJECTS, POSTS);
const known = buildEntries(PROJECTS, POSTS).map(entry => entry.id);
const byId = id => questions.find(question => question.id === id);

describe('buildQuestions', () => {
    it('asks about a project by name and expects that project', () => {
        expect(byId('name:health')).toMatchObject({
            question: 'What is Health Analytics about?',
            expect: ['project:health'],
        });
    });

    it('asks about a technology only one project uses, and never a shared one', () => {
        expect(byId('tech:LiDAR').expect).toEqual(['project:health']);
        expect(byId('tech:Shared')).toBeUndefined();
    });

    it('asks about a topic only one post has, and never a shared tag', () => {
        expect(byId('tag:MCP').expect).toEqual(['post:agent-ready']);
        expect(byId('tag:CSS').expect).toEqual(['post:how-it-works']);
        expect(byId('tag:Workers')).toBeUndefined();
    });

    it('asks from the start of a description, only for a project whose description does not give its name away', () => {
        const described = questions.filter(item => item.id.startsWith('description:'));
        expect(described.length).toBeGreaterThan(0);
        for (const question of described) {
            const project = PROJECTS.projects.find(
                item => `description:${item.name}` === question.id
            );
            const start = project.description.split(/\s+/).slice(0, 8).join(' ');
            expect(question.question).toBe(`Which project is this: ${start}`);
            expect(start.toLowerCase()).not.toContain(project.name);
        }
        // "UniFi network monitoring" says "network", so that project is left out
        expect(byId('description:network')).toBeUndefined();
    });

    it('has questions the site cannot answer, none of which mentions anything the site has', () => {
        const none = questions.filter(item => item.none);
        expect(none.length).toBeGreaterThanOrEqual(2);
        for (const item of none) {
            expect(item.expect).toEqual([]);
            // A weather question was a bad test while the site has a weather app
            expect(item.question.toLowerCase()).not.toMatch(
                /weather|health|home|network|game|dbt|analytics|site|portfolio/
            );
        }
    });

    it('never expects an id that is not a real project or post', () => {
        const real = new Set([
            ...PROJECTS.projects.map(p => `project:${p.name}`),
            ...POSTS.posts.map(p => `post:${p.slug}`),
        ]);
        for (const item of questions)
            for (const id of item.expect) expect(real.has(id), id).toBe(true);
    });
});

describe('score', () => {
    const asked = { id: 'x', expect: ['project:a'] };

    it('top1 is the right page first, anywhere is the right page among the picks', () => {
        expect(score(asked, { ids: ['project:a', 'project:b'] })).toEqual({
            top1: true,
            anywhere: true,
        });
        expect(score(asked, { ids: ['project:b', 'project:a'] })).toEqual({
            top1: false,
            anywhere: true,
        });
        expect(score(asked, { ids: ['project:b'] })).toEqual({ top1: false, anywhere: false });
        expect(score(asked, { status: 'error' })).toEqual({ top1: false, anywhere: false });
    });

    it('a question with no answer is right only when no page is picked', () => {
        const none = { id: 'n', expect: [], none: true };
        expect(score(none, { ids: [] })).toEqual({ top1: true, anywhere: true });
        expect(score(none, { ids: ['project:a'] })).toEqual({ top1: false, anywhere: false });
    });
});

describe('printable', () => {
    it('turns newlines, escape codes and anything not plain ASCII into "?"', () => {
        expect(printable('project:health')).toBe('project:health');
        expect(printable('a\nb\r\nc')).toBe('a?b??c');
        expect(printable('\u001b[2J\u001b[31mred')).toBe('?[2J?[31mred');
        expect(printable('caf\u00e9 \u202e')).toBe('caf? ?');
        expect(printable(undefined)).toBe('undefined');
    });
});

describe('readResults: what the page posts back is checked, because anything on localhost can post', () => {
    const ok = id => ({
        id,
        result: { status: 'ok', ids: ['project:health'], invalid: 0 },
        ms: 120,
    });
    const first = questions[0].id;
    const body = rows => JSON.stringify(rows);

    it('accepts a well-formed result and scores it against the question', () => {
        const [row] = readResults(body([ok(first)]), questions, known);
        expect(row.question.id).toBe(first);
        expect(row.result).toEqual({ status: 'ok', ids: ['project:health'], invalid: 0 });
        expect(row.ms).toBe(120);
        expect(typeof row.top1).toBe('boolean');
    });

    it.each([
        ['text that is not JSON', 'not json at all'],
        ['JSON that is not a list', '{"id":"x"}'],
        ['an empty list', '[]'],
        ['a question that does not exist', body([ok('name:does-not-exist')])],
        [
            'a status it does not know',
            body([{ ...ok(first), result: { status: 'pwned', ids: [] } }]),
        ],
        [
            'ids that are not a list',
            body([{ ...ok(first), result: { status: 'ok', ids: 'project:health' } }]),
        ],
        [
            'more than three ids',
            body([
                {
                    ...ok(first),
                    result: {
                        status: 'ok',
                        ids: ['project:a', 'project:b', 'project:c', 'project:d'],
                    },
                },
            ]),
        ],
        [
            'an id with a newline in it',
            body([
                {
                    ...ok(first),
                    result: { status: 'ok', ids: ['project:health\nPASS all 15 checked'] },
                },
            ]),
        ],
        [
            'an id with a terminal escape code',
            body([{ ...ok(first), result: { status: 'ok', ids: ['project:\u001b[2Jx'] } }]),
        ],
        [
            'an id that is not a page id',
            body([{ ...ok(first), result: { status: 'ok', ids: ['../../etc/passwd'] } }]),
        ],
        ['an id that is not text', body([{ ...ok(first), result: { status: 'ok', ids: [7] } }])],
        [
            'more results than there are questions',
            body(Array.from({ length: questions.length + 1 }, () => ok(first))),
        ],
    ])('rejects %s, without echoing it', (_name, posted) => {
        expect(() => readResults(posted, questions, known)).toThrow(
            /^(the results|a result is malformed)/
        );
        try {
            readResults(posted, questions, known);
        } catch (error) {
            expect(error.message).not.toMatch(/etc\/passwd|PASS all|pwned/);
            expect(error.message.includes(String.fromCharCode(27))).toBe(false);
        }
    });

    it('keeps numbers in range instead of passing them on', () => {
        const [row] = readResults(
            body([{ ...ok(first), ms: 1e12, result: { status: 'ok', ids: [], invalid: 9999 } }]),
            questions,
            known
        );
        expect(row.ms).toBe(0);
        expect(row.result.invalid).toBe(0);
        const [text] = readResults(
            body([
                {
                    ...ok(first),
                    ms: '5\nforged',
                    result: { status: 'ok', ids: [], invalid: '1\n2' },
                },
            ]),
            questions,
            known
        );
        expect(text.ms).toBe(0);
        expect(text.result.invalid).toBe(0);
    });
});

describe('what is printed never comes from the posted text', () => {
    const lines = rows => {
        const printed = [];
        const log = console.log;
        console.log = (...args) => printed.push(args.join(' '));
        try {
            summarize(rows);
        } finally {
            console.log = log;
        }
        return printed.join('\n').split('\n');
    };
    const post = (ms, invalid) =>
        readResults(
            JSON.stringify(
                questions.map(question => ({
                    id: question.id,
                    result: { status: 'ok', ids: ['project:health'], invalid },
                    ms,
                }))
            ),
            questions,
            known
        );

    it('msLabel and countLabel read from a fixed table, to the nearest ten and clamped', () => {
        expect(msLabel(0)).toBe('0');
        expect(msLabel(1537)).toBe('1540');
        expect(msLabel(4)).toBe('0');
        expect(msLabel(5)).toBe('10');
        expect(msLabel(-50)).toBe('0');
        expect(msLabel(9e9)).toBe('600000');
        expect(countLabel(0)).toBe('0');
        expect(countLabel(7)).toBe('7');
        expect(countLabel(-3)).toBe('0');
        expect(countLabel(1e6)).toBe('200');
    });

    it('a report is plain printable text whatever numbers were posted', () => {
        for (const [ms, invalid] of [
            [120, 0],
            [1e12, 9999],
            [-5, -5],
            [599999, 10],
        ]) {
            const printed = lines(post(ms, invalid));
            for (const line of printed) expect(line, line).toMatch(/^[\x20-\x7e]*$/);
            expect(printed.some(line => line.startsWith('right page first'))).toBe(true);
        }
    });

    it("the ids in the report are the site's own strings, and a result cannot add text of its own", () => {
        const printed = lines(post(120, 0)).join('\n');
        expect(printed).toContain('-> project:health');
        expect(printed).toContain('name:health');
    });

    it('an id off the site makes the run fail (exit 1) and is counted, not shown', () => {
        const rows = post(100, 2);
        const log = console.log;
        console.log = () => {};
        const code = summarize(rows);
        console.log = log;
        expect(code).toBe(1);
        expect(lines(rows).at(-1)).toContain(
            `questions with a page id not on the site: ${questions.length}`
        );
    });
});
