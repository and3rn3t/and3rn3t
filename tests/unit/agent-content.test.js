/**
 * What crawlers and AI agents read: robots.txt, llms.txt and the order of the home page's
 * source (Cloudflare converts each page to Markdown, in source order, for a request that sends
 * `Accept: text/markdown`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderLlmsTxt } from '../../scripts/templates/llms.mjs';

// jsdom replaces URL, so build the path with join rather than fileURLToPath(new URL(...))
const read = file => readFileSync(join(import.meta.dirname, '..', '..', file), 'utf8');

/** robots.txt as groups: [{ agents: ['*'], rules: [['allow', '/']] }], plus the other lines. */
function parseRobots(text) {
    const groups = [];
    const other = [];
    let group = null;
    for (const raw of text.split('\n')) {
        const [field, ...rest] = raw.split('#')[0].split(':');
        const value = rest.join(':').trim();
        const name = field.trim().toLowerCase();
        if (!name) continue;
        if (name === 'user-agent') {
            // Consecutive User-agent lines share one group; a rule line ends the run
            if (!group || group.rules.length) groups.push((group = { agents: [], rules: [] }));
            group.agents.push(value);
        } else if (name === 'sitemap') {
            other.push([name, value]);
        } else {
            group.rules.push([name, value]);
        }
    }
    return { groups, other };
}

describe('robots.txt', () => {
    const { groups, other } = parseRobots(read('robots.txt'));
    const groupFor = agent => groups.filter(group => group.agents.includes(agent));

    // Two groups for the same agent get merged by a crawler, in ways that differ per crawler
    it('names each user agent in one group only', () => {
        const agents = groups.flatMap(group => group.agents.map(agent => agent.toLowerCase()));
        expect(new Set(agents).size).toBe(agents.length);
        expect(groupFor('*')).toHaveLength(1);
    });

    it('lets every crawler read the whole site, scripts and data included', () => {
        for (const group of groups) {
            expect(group.rules.filter(([name]) => name === 'disallow')).toEqual([]);
            expect(group.rules).toContainEqual(['allow', '/']);
        }
    });

    it('says how the content may be used, for every group', () => {
        for (const group of groups) {
            expect(group.rules).toContainEqual([
                'content-signal',
                'search=yes, ai-input=yes, ai-train=yes',
            ]);
        }
    });

    it.each(['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'])(
        'names %s explicitly',
        agent => {
            expect(groupFor(agent)).toHaveLength(1);
        }
    );

    it('points at the sitemap', () => {
        expect(other).toContainEqual(['sitemap', 'https://andernet.dev/sitemap.xml']);
    });
});

describe('llms.txt', () => {
    const render = (overrides = {}) =>
        renderLlmsTxt({
            projects: [
                {
                    displayName: 'A [bracketed] project',
                    pageUrl: '/projects/a/',
                    description: 'Does a thing.\nOn two lines.',
                },
            ],
            posts: [{ title: 'A post', slug: 'a-post', summary: 'About it.', date: '2026-03-04' }],
            experience: [
                { role: 'Engineer', company: 'Acme', startDate: '2021', current: true },
                { role: 'Analyst', company: 'Acme', startDate: '2013', endDate: '2021' },
            ],
            education: [{ degree: 'B.A.', institution: 'A University', endDate: '2009' }],
            ...overrides,
        });

    it('opens with the name as the only H1, then a summary block quote', () => {
        const lines = render().split('\n');
        expect(lines[0]).toBe('# Matthew Anderson');
        expect(lines[2]).toMatch(/^> Engineer at Acme\. /);
        expect(lines.filter(line => line.startsWith('# '))).toHaveLength(1);
    });

    it('links each project and post by its full address, one per line', () => {
        const text = render();
        expect(text).toContain(
            '- [A (bracketed) project](https://andernet.dev/projects/a/): Does a thing. On two lines.'
        );
        expect(text).toContain(
            '- [A post](https://andernet.dev/posts/a-post/): About it. (2026-03-04)'
        );
    });

    it('gives the work history and education with their years', () => {
        const text = render();
        expect(text).toContain('- Engineer, Acme, 2021 to present');
        expect(text).toContain('- Analyst, Acme, 2013 to 2021');
        expect(text).toContain('- B.A., A University, 2009');
    });

    it('has no summary role when no job is current', () => {
        const text = render({
            experience: [{ role: 'Analyst', company: 'Acme', endDate: '2021' }],
        });
        expect(text.split('\n')[2]).toMatch(/^> Side projects /);
    });

    it('the committed file lists every project page and post page', () => {
        const committed = read('llms.txt');
        const sitemap = read('sitemap.xml');
        const pages = [...sitemap.matchAll(/<loc>([^<]+\/(?:projects|posts)\/[^<]+)<\/loc>/g)];
        expect(pages.length).toBeGreaterThan(0);
        for (const [, url] of pages) expect(committed).toContain(`(${url})`);
    });
});

describe('what the site publishes for agents', () => {
    it.each(['/robots.txt', '/llms.txt', '/sitemap.xml'])('pages.yml publishes %s', path => {
        expect(read('.github/workflows/pages.yml')).toMatch(new RegExp(`^\\s+${path}$`, 'm'));
    });

    // The Markdown an agent gets follows the source, so the page must come before the dialogs
    it('the home page puts its content ahead of the dialogs', () => {
        const html = read('index.html');
        const firstDialog = html.indexOf('<dialog');
        expect(firstDialog).toBeGreaterThan(html.indexOf('</main>'));
        expect(firstDialog).toBeGreaterThan(html.indexOf('</footer>'));
    });
});
