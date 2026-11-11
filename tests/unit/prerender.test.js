import { describe, expect, it } from 'vitest';
import {
    orderProjects,
    projectView,
    relativeTime,
    selectProjects,
} from '../../modules/utils/projects.js';
import { formatDateRange, renderTimeline } from '../../scripts/templates/experience.mjs';
import { renderCover } from '../../scripts/templates/cover.mjs';
import {
    renderLeadCard,
    renderListRow,
    renderProjects,
    renderWorkCard,
} from '../../scripts/templates/projects.mjs';
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
    it('leaves the "featured" repo topic out of the tags: it is not a technology', () => {
        const v = projectView({ ...REPOS[0], topics: ['featured', 'swiftui'] }, null);
        expect(v.secondaryTags).toEqual(['swiftui']);
    });

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

describe('relativeTime', () => {
    const now = Date.parse('2026-11-11T12:00:00Z');

    it('formats relative times compactly', () => {
        expect(relativeTime(new Date(now - 5 * 60000), now)).toBe('5m ago');
        expect(relativeTime(new Date(now - 3 * 3600000), now)).toBe('3h ago');
        expect(relativeTime(new Date(now - 2 * 86400000), now)).toBe('2d ago');
        expect(relativeTime(new Date(now - 400 * 86400000), now)).toBe('1y ago');
    });
});

// The shape in projects-data.json; the image file names come from the project's name
const SCREENSHOT = { url: 'https://demo.example', alt: 'The alpha dashboard' };

/** A project view with just what the templates read, plus any overrides. */
const view = (overrides = {}) =>
    projectView(REPOS[0], {
        name: 'alpha',
        displayName: 'A <b>bold</b> name',
        description: 'Does "things"',
        category: 'Tools',
        highlights: ['First', 'Second'],
        longDescription: 'Long',
        featured: 1,
        ...overrides,
    });

describe('project templates (all three shapes)', () => {
    const shapes = {
        'lead card': v => renderLeadCard(v),
        'work card': v => renderWorkCard(v),
        'list row': v => renderListRow(v),
    };

    for (const [name, render] of Object.entries(shapes)) {
        describe(name, () => {
            const v = view({ screenshot: SCREENSHOT });

            it('escapes curated text', () => {
                const html = render(v);
                expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; name');
                expect(html).not.toContain('<b>bold</b>');
            });

            it('bakes in nothing that changes from day to day', () => {
                const html = render(v);
                expect(html).not.toContain('data-live');
                expect(html).not.toMatch(/\d+[mhdw]o? ago/);
                expect(html).not.toContain('>9<'); // the repo's star count
            });

            it('holds the case-study button until its study is registered', () => {
                expect(render(v)).toMatch(/<button[^>]*data-case-study="alpha"[^>]*data-pending/);
                expect(render(view({ longDescription: undefined, highlights: [] }))).not.toContain(
                    'data-case-study'
                );
            });

            it('carries data-project so the browser can find it', () => {
                expect(render(v)).toContain('data-project="alpha"');
            });
        });
    }

    it('never writes an unsafe homepage into the page', () => {
        for (const homepage of [
            'javascript:alert(1)',
            'data:text/html,<b>x</b>',
            'vbscript:msgbox(1)',
        ]) {
            for (const render of [renderLeadCard, renderWorkCard]) {
                const html = render(view({ homepage, screenshot: SCREENSHOT }));
                expect(html, homepage).not.toMatch(/javascript:|data:text|vbscript:/);
                expect(html, homepage).not.toContain('Live demo');
            }
        }
        const fromRepo = renderWorkCard(
            projectView({ ...REPOS[0], homepage: 'javascript:alert(1)' }, null)
        );
        expect(fromRepo).not.toContain('javascript:');
    });

    it('offers a live demo only when there is a safe one', () => {
        expect(renderWorkCard(view({ homepage: 'https://demo.example' }))).toContain('Live demo');
        expect(renderWorkCard(view({ homepage: undefined }))).not.toContain('Live demo');
    });
});

describe('project pictures', () => {
    it('a screenshot is AVIF with a WebP fallback, per theme, with its alt text and dimensions', () => {
        const html = renderWorkCard(view({ screenshot: SCREENSHOT }));
        for (const scheme of ['light', 'dark']) {
            expect(html).toContain(`/images/projects/alpha-${scheme}-640.avif 640w`);
            expect(html).toContain(`/images/projects/alpha-${scheme}-1200.webp`);
        }
        expect(html.match(/alt="The alpha dashboard"/g)).toHaveLength(2);
        expect(html.match(/width="1200" height="750"/g)).toHaveLength(2);
    });

    it('without one, the card shows its generated cover, as decoration', () => {
        const html = renderWorkCard(view({ screenshot: undefined }));
        expect(html).toContain('/images/projects/alpha-cover-light.svg');
        expect(html).toContain('/images/projects/alpha-cover-dark.svg');
        expect(html).not.toContain('<picture');
        expect(html.match(/ alt=""/g)).toHaveLength(2);
    });

    it('is lazy, so the picture for the other theme is never fetched', () => {
        expect(renderWorkCard(view())).toMatch(/loading="lazy"/);
    });
});

describe('renderProjects', () => {
    const shot = { screenshot: SCREENSHOT };
    const named = (name, extra = {}) =>
        projectView(
            { name, language: 'Go', html_url: `https://github.com/o/${name}` },
            { name, displayName: name, ...extra }
        );

    it('leads with the first project when it has a screenshot', () => {
        const out = renderProjects([
            named('a', { ...shot, featured: 1 }),
            named('b', { featured: 2 }),
        ]);
        expect(out.counts).toEqual({ lead: 1, cards: 1, more: 0 });
        expect(out.lead).toContain('lead-card');
    });

    it('has no lead when the first project has no screenshot', () => {
        const out = renderProjects([
            named('a', { featured: 1 }),
            named('b', { ...shot, featured: 2 }),
        ]);
        expect(out.counts.lead).toBe(0);
        expect(out.lead).toBe('');
        expect(out.counts.cards).toBe(2);
    });

    it('puts featured projects in the grid and the rest in a compact list', () => {
        const out = renderProjects([
            named('a', { ...shot, featured: 1 }),
            named('b', { featured: 2 }),
            named('c'),
            named('d'),
        ]);
        expect(out.counts).toEqual({ lead: 1, cards: 1, more: 2 });
        expect(out.more).toContain('project-list');
        expect(out.more.match(/project-list__row/g)).toHaveLength(2);
    });

    it('shows everything as cards when nothing is featured, so the section is never only a list', () => {
        const out = renderProjects([named('a'), named('b'), named('c')]);
        expect(out.counts).toEqual({ lead: 0, cards: 3, more: 0 });
        expect(out.more).toBe('');
    });
});

describe('generated covers', () => {
    it('are deterministic: the same name always draws the same picture', () => {
        expect(renderCover('homehub', 'light')).toBe(renderCover('homehub', 'light'));
    });

    it('differ by name, and share their lines across themes', () => {
        expect(renderCover('homehub', 'light')).not.toBe(renderCover('minecraft', 'light'));
        const lines = svg => svg.match(/<g[^>]*>(.*)<\/g>/s)[1];
        expect(lines(renderCover('homehub', 'light'))).toBe(lines(renderCover('homehub', 'dark')));
    });

    it('are valid, themed SVG documents of a sensible size', () => {
        const light = renderCover('homehub', 'light');
        const dark = renderCover('homehub', 'dark');
        for (const svg of [light, dark]) {
            const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
            expect(doc.querySelector('parsererror')).toBeNull();
            expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 1200 750');
            expect(svg.length).toBeLessThan(20_000);
        }
        expect(light).not.toBe(dark);
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
