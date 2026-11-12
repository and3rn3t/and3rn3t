/**
 * A project's generated page: scripts/templates/project-page.mjs, and the data it reads.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectPagePath, projectView } from '../../modules/utils/projects.js';
import { VIEW_TRANSITION_CSS } from '../../scripts/templates/chrome.mjs';
import { renderProjectPage, shareImage } from '../../scripts/templates/project-page.mjs';

const REPO = {
    name: 'alpha',
    language: 'Swift',
    stargazers_count: 9,
    html_url: 'https://github.com/o/alpha',
};

const view = (overrides = {}) =>
    projectView(
        { ...REPO, name: overrides.name ?? REPO.name },
        {
            name: 'alpha',
            displayName: 'Alpha',
            description: 'Does "things"',
            longDescription: 'The long story',
            highlights: ['First', 'Second'],
            technologies: ['Swift', 'SwiftUI'],
            category: 'Tools',
            status: 'Active',
            screenshot: { url: 'https://demo.example', alt: 'The alpha dashboard' },
            ...overrides,
        }
    );

const page = (overrides = {}, { prev = null, next = null, image = 'https://x.test/i.png' } = {}) =>
    renderProjectPage({ view: view(overrides), prev, next, image });

/** Every JSON-LD block in a page, parsed. */
const jsonLd = html =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match =>
        JSON.parse(match[1])
    );

describe('project page', () => {
    it('is a complete, titled document with one h1', () => {
        const html = page();
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('<title>Alpha | ');
        expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
        expect(html).toContain('<link rel="canonical" href="https://andernet.dev/projects/alpha/"');
    });

    it('uses the share image it is given for Open Graph and Twitter', () => {
        const html = page({}, { image: 'https://x.test/card.jpg' });
        expect(html).toMatch(/property="og:image" content="https:\/\/x\.test\/card\.jpg"/);
        expect(html).toMatch(/name="twitter:image" content="https:\/\/x\.test\/card\.jpg"/);
    });

    it('writes SoftwareSourceCode and BreadcrumbList structured data that parse', () => {
        const [code, crumbs] = jsonLd(page());
        expect(code['@type']).toBe('SoftwareSourceCode');
        expect(code.name).toBe('Alpha');
        expect(code.codeRepository).toBe('https://github.com/o/alpha');
        expect(crumbs['@type']).toBe('BreadcrumbList');
        expect(crumbs.itemListElement.at(-1).item).toBe('https://andernet.dev/projects/alpha/');
    });

    it('shows the overview, highlights, facts and stack from the data', () => {
        const html = page();
        expect(html).toContain('The long story');
        expect(html).toContain('<li>First</li>');
        expect(html).toContain('<dd>Active</dd>');
        expect(html).toContain('<li class="tag">SwiftUI</li>');
    });

    it('shows curated metrics only when there are some', () => {
        expect(page()).not.toContain('class="metrics"');
        const html = page({ metrics: [{ value: '4.2k', label: 'Requests a day' }] });
        expect(html).toContain('class="metrics"');
        expect(html).toContain('4.2k');
        expect(html).toContain('Requests a day');
    });

    it('treats hostile data as inert text', () => {
        const html = page({
            displayName: '<img src=x onerror="globalThis.pwned=1">',
            description: '<script>globalThis.pwned=1</script>',
            longDescription: '<svg onload=alert(1)>',
            highlights: ['<i>hi</i>'],
            technologies: ['<b>bold</b>'],
            status: 'Active "><svg onload=alert(1)>',
            homepage: 'javascript:alert(1)',
        });
        document.documentElement.innerHTML = html;
        expect(
            document.querySelector('main img[onerror], main script, main svg[onload]')
        ).toBeNull();
        expect(document.querySelector('main b, main i')).toBeNull();
        expect(document.querySelector('h1').textContent).toContain('<img');
        expect(html).not.toContain('javascript:');
        expect(html).not.toContain('Live demo');
    });

    it('offers a live demo only when there is a safe one', () => {
        expect(page({ homepage: 'https://demo.example' })).toContain('Live demo');
        expect(page({ homepage: undefined })).not.toContain('Live demo');
    });

    it('links to the neighbouring projects, and leaves a gap at either end', () => {
        const prev = view({ name: 'p', displayName: 'Prev one' });
        const next = view({ name: 'n', displayName: 'Next one' });
        const both = page({}, { prev, next });
        expect(both).toContain('href="/projects/p/" rel="prev"');
        expect(both).toContain('href="/projects/n/" rel="next"');

        const first = page({}, { next });
        expect(first).not.toContain('rel="prev"');
        expect(first).toContain('rel="next"');
    });

    it('names the image and title for the page transition and loads the hero eagerly', () => {
        const html = page();
        expect(html).toContain('data-vt="title"');
        expect(html).toContain('class="project-hero" data-vt="media"');
        expect(html).toContain('/modules/page-transitions.js');
        expect(html).not.toMatch(/project-hero[\s\S]*loading="lazy"[\s\S]*<h2/);
    });
});

describe('shareImage', () => {
    it("is the project's own crop when it exists", () => {
        expect(shareImage(view(), path => path === '/images/projects/alpha-og.jpg')).toBe(
            'https://andernet.dev/images/projects/alpha-og.jpg'
        );
    });

    it("falls back to the site's card when there is no crop, or no screenshot", () => {
        expect(shareImage(view(), () => false)).toBe('https://andernet.dev/og/default.png');
        expect(shareImage(view({ screenshot: undefined }), () => true)).toBe(
            'https://andernet.dev/og/default.png'
        );
    });
});

describe('project slugs', () => {
    it('are lowercased, so the page URL is stable whatever the repo is called', () => {
        expect(projectPagePath('healthkitbridge')).toBe('/projects/healthkitbridge/');
        expect(view({ name: 'HealthKitBridge' }).pageSlug).toBe('healthkitbridge');
    });

    it('come from the repository name, not the display key, with or without live data', () => {
        const meta = {
            name: 'Pretty Name',
            github_repo: 'o/Alpha',
            longDescription: 'A write-up.',
        };
        const repo = { name: 'Alpha', language: 'x', html_url: 'https://github.com/o/Alpha' };
        expect(projectView(null, meta).pageSlug).toBe('alpha');
        expect(projectView(repo, meta).pageSlug).toBe('alpha');
        expect(projectView(null, meta).pageUrl).toBe('/projects/alpha/');
    });

    it('come out the same with or without the repo, for every curated project', () => {
        const { projects } = JSON.parse(readFileSync('projects-data.json', 'utf8'));
        const slugs = projects.map(meta => projectView(null, meta).pageSlug);
        expect(new Set(slugs).size).toBe(slugs.length);
        for (const meta of projects) {
            const repo = { name: meta.name, language: 'x', html_url: 'https://github.com/o/x' };
            expect(projectView(repo, meta).pageSlug).toBe(projectView(null, meta).pageSlug);
        }
    });
});

describe('view transition opt-in', () => {
    // Collapse whitespace so Prettier's layout of index.html doesn't matter
    const squash = text => text.replaceAll(/\s+/g, '');

    it('is inline in the head of the home page, a project page and a post page, identically', () => {
        const wanted = squash(VIEW_TRANSITION_CSS);
        for (const [name, html] of [
            ['index.html', readFileSync('index.html', 'utf8')],
            ['a project page', page()],
            ['a post page', readFileSync('posts/how-this-site-works/index.html', 'utf8')],
        ]) {
            const head = html.slice(0, html.indexOf('</head>'));
            const styles = [...head.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match =>
                squash(match[1])
            );
            expect(
                styles.some(style => style.includes(wanted)),
                name
            ).toBe(true);
        }
    });

    it('is not left in the stylesheet, where Chrome sometimes reads it too late', () => {
        expect(readFileSync('styles/core.css', 'utf8')).not.toMatch(/^@view-transition/m);
    });
});
