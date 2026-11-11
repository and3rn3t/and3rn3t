/**
 * A post's generated page and the 404 page: scripts/templates/post-page.mjs, not-found.mjs, and
 * the options they need from the shared head in chrome.mjs.
 */
import { describe, expect, it } from 'vitest';
import { renderHead } from '../../scripts/templates/chrome.mjs';
import { renderNotFoundPage } from '../../scripts/templates/not-found.mjs';
import { postPath, renderPostPage } from '../../scripts/templates/post-page.mjs';

const post = (overrides = {}) => ({
    slug: 'a-post',
    title: 'A <b>bold</b> title',
    summary: 'Says "things" & more',
    date: '2026-03-04',
    tags: ['CSS', '<i>x</i>'],
    content: '<p>Body with <code>code</code> and <a href="/x">a link</a>.</p>',
    ...overrides,
});

const jsonLd = html =>
    [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match =>
        JSON.parse(match[1])
    );

describe('post page', () => {
    const render = (overrides, neighbours = {}) =>
        renderPostPage({ post: post(overrides), ...neighbours });

    it('is a complete document on the shared stylesheets, not the legacy one', () => {
        const html = render();
        expect(html.startsWith('<!doctype html>')).toBe(true);
        expect(html).toContain('href="/styles/core.css"');
        expect(html).toContain('href="/styles/article.css"');
        expect(html).not.toMatch(/href="\/styles\.css"/);
        expect(html).not.toContain('dark-theme');
        expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    });

    it('escapes the title, summary and tags but passes the body through as written', () => {
        const html = render();
        expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; title');
        expect(html).not.toContain('<b>bold</b>');
        expect(html).toContain('<li class="tag">&lt;i&gt;x&lt;/i&gt;</li>');
        expect(html).toContain('<p>Body with <code>code</code> and <a href="/x">a link</a>.</p>');
        expect(html).toContain('content="Says &quot;things&quot; &amp; more"');
    });

    it('has its own canonical, article metadata and BlogPosting + BreadcrumbList data', () => {
        const html = render();
        expect(html).toContain('<link rel="canonical" href="https://andernet.dev/posts/a-post/"');
        expect(html).toContain('property="og:type" content="article"');
        expect(html).toContain('property="article:published_time" content="2026-03-04"');
        expect(html).toContain('property="article:tag" content="CSS"');
        const [article, crumbs] = jsonLd(html);
        expect(article['@type']).toBe('BlogPosting');
        expect(article.datePublished).toBe('2026-03-04');
        expect(article.keywords).toBe('CSS, <i>x</i>');
        expect(crumbs['@type']).toBe('BreadcrumbList');
        expect(crumbs.itemListElement.at(-1).item).toBe('https://andernet.dev/posts/a-post/');
    });

    it('shows the date and reading time, and the reading-progress bar', () => {
        const html = render();
        expect(html).toContain('<time datetime="2026-03-04">');
        expect(html).toMatch(/\d+ min read/);
        expect(html).toContain('class="reading-progress" aria-hidden="true"');
    });

    it('pages to the newer post as "previous" and the older one as "next"', () => {
        const newer = post({ slug: 'newer', title: 'Newer one' });
        const older = post({ slug: 'older', title: 'Older one' });
        const both = render({}, { newer, older });
        expect(both).toContain('href="/posts/newer/" rel="prev"');
        expect(both).toContain('Newer post');
        expect(both).toContain('href="/posts/older/" rel="next"');
        expect(both).toContain('Older post');

        const newest = render({}, { older });
        expect(newest).not.toContain('rel="prev"');
        expect(newest).toContain('rel="next"');
        expect(render()).not.toContain('class="pager"');
    });

    it('omits the tag list when there are no tags', () => {
        const html = render({ tags: [] });
        expect(html).not.toContain('class="tag-list"');
        expect(html).not.toContain('article:tag');
    });

    it('builds the path the sitemap and feed use', () => {
        expect(postPath({ slug: 'a-post' })).toBe('/posts/a-post/');
    });
});

describe('404 page', () => {
    const html = renderNotFoundPage();

    it('is kept out of search results and has no address of its own', () => {
        expect(html).toContain('<meta name="robots" content="noindex" />');
        expect(html).not.toContain('rel="canonical"');
        expect(html).not.toContain('property="og:url"');
    });

    it('uses only absolute URLs, because it is served at whatever address was missing', () => {
        const urls = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)].map(match => match[1]);
        expect(urls.length).toBeGreaterThan(5);
        for (const url of urls) {
            expect(url.startsWith('/') || url.startsWith('https://'), url).toBe(true);
        }
    });

    it('says what happened and offers the way home', () => {
        expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
        expect(html).toContain('href="/"');
        expect(html).toContain('href="/#projects"');
        expect(html).toContain('href="/#writing"');
        expect(html).toContain('href="/#contact"');
    });
});

describe('shared head options', () => {
    const head = options => renderHead({ title: 'T', description: 'D', path: '/x/', ...options });

    it('defaults to an indexable page with a canonical address', () => {
        const html = head({});
        expect(html).toContain('content="index, follow, max-image-preview:large"');
        expect(html).toContain('<link rel="canonical" href="https://andernet.dev/x/"');
        expect(html).toContain('property="og:url" content="https://andernet.dev/x/"');
    });

    it('can carry extra meta tags and a different robots value', () => {
        const html = head({
            robots: 'noindex',
            extraMeta: '    <meta name="extra" content="1" />',
        });
        expect(html).toContain('<meta name="robots" content="noindex" />');
        expect(html).toContain('<meta name="extra" content="1" />');
    });
});
