import { describe, expect, it } from 'vitest';
import { blockedReason } from '../../.claude/hooks/guard-generated.mjs';

const root = '/repo';
const call = (file_path, extra = {}) => ({ root, tool_input: { file_path, ...extra } });

const INDEX = [
    '<h1>Hand written</h1>',
    '<!-- gen:projects -->',
    '<p>generated card</p>',
    '<!-- /gen:projects -->',
    '<footer>Hand written footer</footer>',
].join('\n');

const SITEMAP = [
    '  <!-- Homepage -->',
    '  <url>/</url>',
    '  <!-- Project Pages -->',
    '  <url>/projects/health/</url>',
    '  <!-- Blog Posts -->',
    '  <url>/posts/a/</url>',
    '  <!-- Offline Page (for PWA) -->',
    '  <url>/offline.html</url>',
].join('\n');

const reader = files => path => {
    const text = files[path];
    if (text === undefined) throw new Error('missing');
    return text;
};

describe('guard-generated hook', () => {
    it.each([
        '/repo/posts/how-this-site-works/index.html',
        '/repo/projects/health/index.html',
        '/repo/status/index.html',
        '/repo/feed.xml',
        '/repo/llms.txt',
        '/repo/404.html',
        '/repo/github-data.json',
        '/repo/images/projects/health-cover-light.svg',
    ])('blocks a hand edit of %s and names the source', file => {
        const reason = blockedReason(call(file, { old_string: 'x' }));
        expect(reason).toContain('generate:site');
        expect(reason).toMatch(/Edit .+ instead/);
    });

    it('lets through the real sources, templates and hand-made images', () => {
        for (const file of [
            '/repo/posts-data.json',
            '/repo/scripts/templates/llms.mjs',
            '/repo/images/projects/health-640.avif',
            '/repo/images/og.svg',
            '/repo/ROADMAP.md',
            '/outside/posts/x.html',
            'worker/mcp.js',
        ]) {
            expect(blockedReason(call(file, { old_string: 'x' }))).toBeNull();
        }
    });

    it('blocks an index.html edit inside a gen: block but not outside it', () => {
        const read = reader({ '/repo/index.html': INDEX });
        expect(
            blockedReason(call('/repo/index.html', { old_string: 'generated card' }), read)
        ).toContain('generated part');
        expect(
            blockedReason(call('/repo/index.html', { old_string: 'Hand written footer' }), read)
        ).toBeNull();
        expect(
            blockedReason(call('/repo/index.html', { old_string: '<h1>Hand written</h1>' }), read)
        ).toBeNull();
    });

    it('checks every edit of a MultiEdit', () => {
        const read = reader({ '/repo/index.html': INDEX });
        const edits = [{ old_string: 'Hand written footer' }, { old_string: 'generated card' }];
        expect(blockedReason(call('/repo/index.html', { edits }), read)).toContain(
            'generated part'
        );
    });

    it('protects the sitemap project and blog entries, not the rest', () => {
        const read = reader({ '/repo/sitemap.xml': SITEMAP });
        expect(
            blockedReason(call('/repo/sitemap.xml', { old_string: '/projects/health/' }), read)
        ).toContain('sitemap');
        expect(
            blockedReason(call('/repo/sitemap.xml', { old_string: '/posts/a/' }), read)
        ).toContain('sitemap');
        expect(
            blockedReason(call('/repo/sitemap.xml', { old_string: '/offline.html' }), read)
        ).toBeNull();
        expect(
            blockedReason(call('/repo/sitemap.xml', { old_string: '<url>/</url>' }), read)
        ).toBeNull();
    });

    it('never blocks because it could not read the file, or for a missing path', () => {
        expect(blockedReason(call('/repo/index.html', { old_string: 'x' }), reader({}))).toBeNull();
        expect(blockedReason({ root, tool_input: {} })).toBeNull();
    });
});
