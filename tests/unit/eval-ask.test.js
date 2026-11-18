import { describe, expect, it } from 'vitest';
import { buildQuestions, score } from '../../scripts/eval-ask.mjs';

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
