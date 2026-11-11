import { describe, expect, it } from 'vitest';
import {
    orderProjects,
    projectView,
    relativeTime,
    selectProjects,
} from '../../modules/utils/projects.js';
import {
    formatDateRange,
    renderEducation,
    renderFacts,
    renderJobs,
} from '../../scripts/templates/experience.mjs';
import { shortDate } from '../../scripts/templates/shared.mjs';
import { renderCover } from '../../scripts/templates/cover.mjs';
import {
    coverFiles,
    renderLeadCard,
    renderListRow,
    renderProjects,
    renderWorkCard,
    splitProjects,
} from '../../scripts/templates/projects.mjs';
import { renderPostRows } from '../../scripts/templates/writing.mjs';

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

            it('links to the project page, not a modal', () => {
                const html = render(v);
                expect(html).toContain('href="/projects/alpha/"');
                expect(html).not.toContain('data-case-study');
                expect(html).not.toContain('data-pending');
                expect(html).not.toContain('<button');
            });

            it('links to the repo when there is no case study to read', () => {
                const html = render(view({ longDescription: undefined, highlights: [] }));
                expect(html).not.toContain('href="/projects/');
                expect(html).toContain('href="https://github.com/o/alpha"');
            });

            it('names the card for the page transition', () => {
                const html = render(v);
                expect(html).toContain('data-page="alpha"');
                expect(html).toContain('data-vt="title"');
                // A list row is text only, so it has no image to morph
                if (name !== 'list row') expect(html).toContain('data-vt="media"');
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

describe('covers match what the cards reference', () => {
    const named = (name, extra = {}) =>
        projectView(
            { name, language: 'Go', html_url: `https://github.com/o/${name}` },
            { name, displayName: name, ...extra }
        );
    const referenced = out =>
        new Set(
            [
                ...(out.lead + out.cards).matchAll(
                    /\/images\/projects\/([^"\s]+-cover-(?:light|dark)\.svg)/g
                ),
            ].map(match => match[1])
        );

    // The generator writes coverFiles(views); every cover a card points at must be in that set,
    // whichever way the projects are arranged. This includes the fallback where nothing is
    // featured and every project becomes a card.
    const arrangements = {
        'one featured card': [named('a', { featured: 1 }), named('b')],
        'nothing featured, so everything is a card': [named('a'), named('b'), named('c')],
        'a screenshot lead and plain cards': [
            named('a', { featured: 1, screenshot: { url: 'https://x', alt: 'x' } }),
            named('b', { featured: 2 }),
            named('c'),
        ],
        'featured cards that already have screenshots': [
            named('a', { featured: 1, screenshot: { url: 'https://x', alt: 'x' } }),
            named('b', { featured: 2, screenshot: { url: 'https://y', alt: 'y' } }),
        ],
    };

    for (const [label, views] of Object.entries(arrangements)) {
        it(`${label}`, () => {
            const written = new Set(coverFiles(splitProjects(views).grid).map(cover => cover.file));
            const pointedAt = referenced(renderProjects(views));
            expect([...pointedAt].filter(file => !written.has(file))).toEqual([]);
            // ...and nothing is written that no card uses
            expect([...written].filter(file => !pointedAt.has(file))).toEqual([]);
        });
    }
});

describe('covers for project pages', () => {
    const named = (name, extra = {}) =>
        projectView(
            { name, language: 'Go', html_url: `https://github.com/o/${name}` },
            { name, displayName: name, longDescription: 'text', ...extra }
        );

    it('are written for page projects that are not on the home grid and lack a screenshot', () => {
        const onPage = named('only-on-page');
        const withShot = named('has-shot', { screenshot: { url: 'https://x', alt: 'x' } });
        const files = coverFiles([], [onPage, withShot]).map(cover => cover.file);
        expect(files).toEqual(['only-on-page-cover-light.svg', 'only-on-page-cover-dark.svg']);
    });

    it('are not written twice for a project on both the grid and the pages', () => {
        const both = named('both');
        expect(coverFiles([both], [both])).toHaveLength(2);
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
    const job = (overrides = {}) => ({
        role: 'Dev <script>',
        company: 'Acme & Sons',
        companyUrl: 'https://acme.example',
        startDate: '2020-01',
        endDate: '2022-06',
        summary: 'Did "things"',
        highlights: ['One', 'Two'],
        technologies: ['Java', 'SAP'],
        ...overrides,
    });

    it('formats date ranges', () => {
        expect(formatDateRange('2021-06', undefined, true)).toBe('Jun 2021 – Present');
        expect(formatDateRange('2013', '2021', false)).toBe('2013 – 2021');
        expect(formatDateRange(undefined, '2009', false)).toBe('2009');
    });

    describe('jobs', () => {
        it('puts role, company and dates on one row, and escapes the text', () => {
            const html = renderJobs([job()]);
            expect(html).toContain('Dev &lt;script&gt;');
            expect(html).not.toContain('<script>');
            expect(html).toContain('Acme &amp; Sons');
            expect(html).toContain('Jan 2020 – Jun 2022');
            expect(html).toMatch(
                /<header class="job__head">[\s\S]*job__role[\s\S]*job__company[\s\S]*job__dates/
            );
        });

        it('folds highlights and technologies into a <details>, open only for the current role', () => {
            const past = renderJobs([job()]);
            expect(past).toContain('<details class="job__more">');
            expect(past).toContain('Highlights <span class="job__count">2</span>');
            expect(past).toContain('<li class="tag">Java</li>');

            const current = renderJobs([job({ current: true })]);
            expect(current).toContain('<details class="job__more" open>');
            expect(current).toContain('job--current');
            expect(current).toContain('Current');
        });

        it('has no <details> when there is nothing to fold away', () => {
            expect(renderJobs([job({ highlights: [], technologies: [] })])).not.toContain(
                '<details'
            );
        });

        it('links the company only when it has a URL', () => {
            expect(renderJobs([job()])).toContain('href="https://acme.example"');
            expect(renderJobs([job({ companyUrl: undefined })])).not.toContain(
                '<a class="job__company-link"'
            );
        });
    });

    describe('education', () => {
        it('is a compact list: what, where, when, and a note if there is one', () => {
            const html = renderEducation([
                {
                    degree: 'B.A.',
                    institution: 'State U',
                    institutionUrl: 'https://u.example',
                    endDate: '2009',
                },
                {
                    degree: 'Bootcamp',
                    institution: 'GA',
                    startDate: '2021',
                    endDate: '2021',
                    highlights: ['12 weeks'],
                },
            ]);
            expect(html.match(/class="edu-row"/g)).toHaveLength(2);
            expect(html).toContain('href="https://u.example"');
            expect(html).toContain('12 weeks');
        });
    });

    describe('facts (About, at a glance)', () => {
        it('come from the current role: what, where, since when', () => {
            const html = renderFacts([job({ current: true, startDate: '2021-06' }), job()]);
            expect(html).toContain('Dev &lt;script&gt;');
            expect(html).toContain('Acme &amp; Sons');
            expect(html).toMatch(/<dt>Since<\/dt><dd>2021<\/dd>/);
        });

        it('are empty when no role is current, rather than describing an old job as the present', () => {
            expect(renderFacts([job()])).toBe('');
            expect(renderFacts([])).toBe('');
        });
    });
});

describe('writing', () => {
    const post = (overrides = {}) => ({
        slug: 'a-post',
        title: 'A & B',
        date: '2026-07-12',
        summary: 'Sum <b>',
        tags: ['x'],
        content: '<p>words</p>',
        readingMinutes: 7,
        ...overrides,
    });

    it('formats a compact date, in UTC', () => {
        expect(shortDate('2026-07-12')).toBe('Jul 12, 2026');
        expect(shortDate('2026-01-01')).toBe('Jan 1, 2026');
    });

    it('is a row per post: date, title and summary, reading time, linking to its page', () => {
        const html = renderPostRows([post()]);
        expect(html).toContain('class="post-row" data-slug="a-post"');
        expect(html).toContain('href="/posts/a-post/"');
        expect(html).toContain('A &amp; B');
        expect(html).toContain('Sum &lt;b&gt;');
        expect(html).toContain('Jul 12, 2026');
        expect(html).toContain('7 min read');
        expect(html).toContain('datetime="2026-07-12"');
    });

    it('renders posts in the order given', () => {
        const html = renderPostRows([post({ slug: 'new' }), post({ slug: 'old' })]);
        expect(html.indexOf('data-slug="new"')).toBeLessThan(html.indexOf('data-slug="old"'));
    });
});
