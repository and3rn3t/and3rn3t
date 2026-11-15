import { describe, expect, it } from 'vitest';
import {
    describeMarkdownReply,
    ENTRY_POINTS,
    parseToolList,
    PREVIEW_CHARS,
} from '../../modules/agent-view.js';

const reply = overrides => ({
    ok: true,
    status: 200,
    contentType: 'text/markdown; charset=utf-8',
    tokens: '1234',
    text: '# A page\n\nSome text.',
    ...overrides,
});

describe('describeMarkdownReply', () => {
    it('counts characters and tokens when Cloudflare sent Markdown', () => {
        const out = describeMarkdownReply(reply());
        expect(out.kind).toBe('markdown');
        expect(out.summary).toBe('20 characters of Markdown, about 1,234 tokens.');
        expect(out.preview).toBe('# A page\n\nSome text.');
    });

    it('leaves out the token estimate when there is none or it is not a number', () => {
        expect(describeMarkdownReply(reply({ tokens: null })).summary).not.toContain('tokens');
        expect(describeMarkdownReply(reply({ tokens: 'lots' })).summary).not.toContain('tokens');
    });

    it('cuts a long page short and says so', () => {
        const out = describeMarkdownReply(reply({ text: 'x'.repeat(PREVIEW_CHARS * 2) }));
        expect(out.preview.length).toBeLessThan(PREVIEW_CHARS + 5);
        expect(out.preview.endsWith('…')).toBe(true);
    });

    it('says plainly when the server sent HTML (a local copy has no converter)', () => {
        const out = describeMarkdownReply(reply({ contentType: 'text/html' }));
        expect(out.kind).toBe('html');
        expect(out.preview).toBe('');
        expect(out.summary).toContain('HTML');
    });

    it('reports a failed request', () => {
        const out = describeMarkdownReply(reply({ ok: false, status: 503 }));
        expect(out).toMatchObject({ kind: 'error', preview: '' });
        expect(out.summary).toContain('503');
    });
});

describe('parseToolList', () => {
    const message = {
        jsonrpc: '2.0',
        id: 1,
        result: {
            tools: [
                { name: 'get_profile', title: 'Get profile' },
                { name: 'list_posts', annotations: { title: 'List posts' } },
                { name: 'bare' },
                { title: 'no name' },
            ],
        },
    };

    it('reads a Server-Sent Events reply, which is what /mcp sends', () => {
        const body = `event: message\ndata: ${JSON.stringify(message)}\n\n`;
        expect(parseToolList(body)).toEqual([
            { name: 'get_profile', title: 'Get profile' },
            { name: 'list_posts', title: 'List posts' },
            { name: 'bare', title: '' },
        ]);
    });

    it('reads a plain JSON reply too', () => {
        expect(parseToolList(JSON.stringify(message))).toHaveLength(3);
    });

    it.each([['not json at all'], ['data: {"result":{}}'], ['{"error":{"code":-32600}}'], ['']])(
        'returns no tools for %j',
        body => {
            expect(parseToolList(body)).toEqual([]);
        }
    );
});

describe('ENTRY_POINTS', () => {
    it('are all same-origin paths', () => {
        for (const { href } of ENTRY_POINTS) {
            expect(href).toMatch(/^\/[^/]/);
        }
    });
});
