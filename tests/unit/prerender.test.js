import { describe, expect, it } from 'vitest';
import {
    isRecentlyPushed,
    orderProjects,
    projectView,
    relativeTime,
    selectProjects,
} from '../../modules/utils/projects.js';
import { formatDateRange, renderTimeline } from '../../scripts/templates/experience.mjs';
import { renderProjectCard, renderProjects } from '../../scripts/templates/projects.mjs';
import { renderBlogCards } from '../../scripts/templates/writing.mjs';

const REPOS = [
    {
        name: 'alpha',
        language: 'Swift',
        stargazers_count: 9,
        html_url: 'https://github.com/o/alpha',
    },
    { name: 'beta', language: 'Python', html_url: 'https://github.com/o/beta' },
    { name: 'gamma', language: 'Go', html_url: 'https://github.com/o/gamma' },
];

const DATA = {
    projects: [
        { name: 'alpha', featured: 2, displayName: 'Alpha', github_repo: 'o/alpha' },
        { name: 'beta', featured: 1, displayName: 'Beta', github_repo: 'o/beta' },
        { name: 'gamma', displayName: 'Gamma', github_repo: 'o/gamma' },
        { name: 'delta', featured: true, displayName: 'Delta', github_repo: 'o/delta' },
    ],
};

const names = projects => projects.map(({ metadata, repo }) => metadata?.name ?? repo?.name);

describe('selectProjects', () => {
    it('shows featured projects first in rank order, then the rest as given', () => {
        const result = selectProjects(DATA, REPOS, ['gamma', 'alpha', 'beta']);
        expect(names(result)).toEqual(['beta', 'alpha', 'delta', 'gamma']);
    });

    it('pins every featured project even when it is not starred', () => {
        // gamma is the only one not featured, so it is the only one starring decides
        expect(names(selectProjects(DATA, REPOS, ['beta']))).toEqual(['beta', 'alpha', 'delta']);
        expect(names(selectProjects(DATA, REPOS, ['gamma']))).toEqual([
            'beta',
            'alpha',
            'delta',
            'gamma',
        ]);
    });

    it('uses the curated list when nothing is starred', () => {
        expect(names(selectProjects(DATA, REPOS, null))).toEqual([
            'beta',
            'alpha',
            'delta',
            'gamma',
        ]);
    });

    it('does not depend on push time, so the output is stable from day to day', () => {
        const touched = REPOS.map(repo => ({ ...repo, pushed_at: '2026-11-11T00:00:00Z' }));
        expect(names(selectProjects(DATA, touched, ['gamma', 'alpha']))).toEqual(
            names(selectProjects(DATA, REPOS, ['gamma', 'alpha']))
        );
    });

    it('drops starred repos that have neither a repo nor metadata, and de-duplicates', () => {
        const result = selectProjects(DATA, REPOS, ['alpha', 'alpha', 'ghost']);
        expect(names(result).filter(name => name === 'alpha')).toHaveLength(1);
        expect(names(result)).not.toContain('ghost');
    });

    it('matches metadata to a repo by the basename of github_repo', () => {
        const data = { projects: [{ name: 'Pretty Name', github_repo: 'o/alpha' }] };
        const [only] = selectProjects(data, REPOS, ['alpha']);
        expect(only.metadata.name).toBe('Pretty Name');
        expect(only.repo.name).toBe('alpha');
    });
});

describe('orderProjects', () => {
    it('ranks a plain featured: true after numbered ranks, in file order', () => {
        const input = [
            { metadata: { name: 'a', featured: true } },
            { metadata: { name: 'b', featured: 3 } },
            { metadata: { name: 'c' } },
            { metadata: { name: 'd', featured: true } },
        ];
        expect(names(orderProjects(input))).toEqual(['b', 'a', 'd', 'c']);
    });
});

describe('projectView', () => {
    it('prefers curated text over the repo and falls back to sensible defaults', () => {
        expect(projectView(REPOS[0], { displayName: 'Alpha!' }).displayName).toBe('Alpha!');
        expect(projectView(REPOS[0], null).displayName).toBe('alpha');
        expect(projectView(null, null).displayName).toBe('Untitled');
    });

    it('offers a case study only when there is something to write about', () => {
        expect(projectView(REPOS[0], { longDescription: 'text' }).hasCaseStudy).toBe(true);
        expect(projectView(REPOS[0], { highlights: ['one'] }).hasCaseStudy).toBe(false);
        expect(projectView(REPOS[0], { highlights: ['one', 'two'] }).hasCaseStudy).toBe(true);
    });

    it('skips the primary language among the secondary tags and caps them at three', () => {
        const view = projectView(REPOS[0], {
            technologies: ['Swift', 'SwiftUI', 'Combine', 'HealthKit', 'iOS'],
        });
        expect(view.secondaryTags).toEqual(['SwiftUI', 'Combine', 'HealthKit']);
    });
});

describe('time helpers', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');

    it('formats relative times compactly', () => {
        expect(relativeTime(new Date(now - 5 * 60000), now)).toBe('5m ago');
        expect(relativeTime(new Date(now - 3 * 3600000), now)).toBe('3h ago');
        expect(relativeTime(new Date(now - 2 * 86400000), now)).toBe('2d ago');
        expect(relativeTime(new Date(now - 400 * 86400000), now)).toBe('1y ago');
    });

    it('treats the last 180 days as recent', () => {
        expect(isRecentlyPushed(new Date(now - 179 * 86400000), now)).toBe(true);
        expect(isRecentlyPushed(new Date(now - 181 * 86400000), now)).toBe(false);
        expect(isRecentlyPushed(undefined, now)).toBe(false);
    });
});

describe('project cards', () => {
    const view = projectView(REPOS[0], {
        displayName: 'A <b>bold</b> name',
        description: 'Does "things"',
        category: 'Tools',
        status: 'Active Development',
        highlights: ['First', 'Second'],
        longDescription: 'Long',
    });

    it('escapes curated text', () => {
        const html = renderProjectCard(view);
        expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; name');
        expect(html).not.toContain('<b>bold</b>');
        expect(html).toContain('Does &quot;things&quot;');
    });

    it('leaves empty slots for the live data instead of baking it in', () => {
        const html = renderProjectCard(view);
        expect(html).toContain('<span data-live="stars">—</span>');
        expect(html).toContain('data-live-stat="pushed" hidden');
        expect(html).not.toContain('>9<'); // the repo's star count
        expect(html).not.toMatch(/\d+[mhdw]o? ago/);
    });

    it('marks the status badge that the live "Active" badge makes redundant', () => {
        expect(renderProjectCard(view)).toContain(
            'status-badge active-development" data-status-active'
        );
        const other = projectView(REPOS[0], { status: 'Archived' });
        expect(renderProjectCard(other)).not.toContain('data-status-active');
    });

    it('links to the demo when there is one and to the README otherwise', () => {
        expect(
            renderProjectCard(projectView(REPOS[0], { homepage: 'https://demo.example' }))
        ).toContain('Live Demo');
        expect(renderProjectCard(view)).toContain('/blob/main/README.md');
    });

    it('never writes an unsafe homepage into the page', () => {
        for (const homepage of [
            'javascript:alert(1)',
            'data:text/html,<b>x</b>',
            'vbscript:msgbox(1)',
        ]) {
            const html = renderProjectCard(projectView(REPOS[0], { homepage }));
            expect(html, homepage).not.toMatch(/javascript:|data:text/);
            expect(html, homepage).toContain('Documentation');
            expect(html, homepage).not.toContain('Live Demo');
        }
        // A repo's own homepage field is checked the same way
        const fromRepo = renderProjectCard(
            projectView({ ...REPOS[0], homepage: 'javascript:alert(1)' }, null)
        );
        expect(fromRepo).not.toContain('javascript:');
    });

    it('always has a place for the push time, even if the repo was unknown at build time', () => {
        const withoutRepo = renderProjectCard(
            projectView(null, { name: 'solo', displayName: 'Solo' })
        );
        expect(withoutRepo).toContain('data-live-stat="pushed"');
        expect(withoutRepo).toContain('data-live="pushed"');
    });

    it('holds the case-study button until its study is registered', () => {
        const withStudy = renderProjectCard(projectView(REPOS[0], { longDescription: 'Long' }));
        expect(withStudy).toMatch(/<button[^>]*data-case-study="alpha"[^>]*data-pending/);
        expect(renderProjectCard(projectView(REPOS[0], null))).not.toContain('data-case-study');
    });

    it('hides extra cards and counts them on the "Show more" button', () => {
        const featured = projectView(REPOS[0], { featured: 1 });
        const rest = [REPOS[1], REPOS[2]].map(repo => projectView(repo, null));
        const { cards, moreButton, extraCount } = renderProjects([featured, ...rest]);

        expect(extraCount).toBe(2);
        expect(cards.match(/data-extra hidden/g)).toHaveLength(2);
        expect(moreButton).toContain('Show 2 more projects');
        expect(moreButton).not.toContain(' hidden');
    });

    it('shows everything, and hides the button, when nothing is featured', () => {
        const { cards, moreButton, extraCount } = renderProjects(
            REPOS.map(repo => projectView(repo, null))
        );
        expect(extraCount).toBe(0);
        expect(cards).not.toContain('data-extra');
        expect(moreButton).toContain('hidden');
    });
});

describe('experience', () => {
    it('formats date ranges', () => {
        expect(formatDateRange('2021-06', undefined, true)).toBe('Jun 2021 – Present');
        expect(formatDateRange('2013', '2021', false)).toBe('2013 – 2021');
        expect(formatDateRange(undefined, '2009', false)).toBe('2009');
    });

    it('renders work and education entries, escaping their text', () => {
        const work = renderTimeline(
            [{ role: 'Dev <script>', company: 'Acme', startDate: '2020-01', current: true }],
            'work'
        );
        expect(work).toContain('timeline-item--current');
        expect(work).toContain('Dev &lt;script&gt;');
        expect(work).toContain('Current');

        const edu = renderTimeline(
            [{ degree: 'B.A.', institution: 'State U', endDate: '2009' }],
            'edu'
        );
        expect(edu).toContain('B.A.');
        expect(edu).toContain('State U');
    });
});

describe('writing', () => {
    it('renders a card per post that links to its page', () => {
        const html = renderBlogCards([
            {
                slug: 'a-post',
                title: 'A & B',
                date: '2026-07-12',
                summary: 'Sum',
                tags: ['x'],
                content: '<p>words</p>',
                readingMinutes: 7,
            },
        ]);
        expect(html).toContain('href="/posts/a-post/"');
        expect(html).toContain('A &amp; B');
        expect(html).toContain('July 12, 2026');
        expect(html).toContain('7 min read');
    });
});
