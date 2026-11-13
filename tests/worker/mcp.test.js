/**
 * The MCP server (worker/mcp.js) and the site data it reads (worker/site-data.js), driven the
 * way a client does: JSON-RPC over POST. fetch is replaced, so no test touches the network.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleMcp } from '../../worker/mcp.js';
import { htmlToText, loadJson } from '../../worker/site-data.js';

const FILES = {
    '/projects-data.json': {
        projects: [
            {
                name: 'health',
                displayName: 'Health Analytics Platform',
                description: 'Gait analysis with iPhone LiDAR.',
                longDescription: 'The long write-up.',
                highlights: ['Live deployment', 'On-device data'],
                category: 'Health & Wellness',
                status: 'Active Development',
                technologies: ['TypeScript', 'HealthKit'],
                github_repo: 'and3rn3t/health',
                homepage: 'https://health.andernet.dev',
                metrics: [{ value: '30 fps', label: 'depth stream' }],
            },
            {
                name: 'minecraft',
                displayName: 'Self-Hosted Minecraft Server',
                description: 'A server on a Pi.',
                category: 'Tools & Automation',
                technologies: ['Python', 'Docker'],
                github_repo: 'and3rn3t/minecraft',
            },
        ],
    },
    '/posts-data.json': {
        posts: [
            {
                slug: 'older',
                title: 'Older post',
                date: '2026-01-01',
                summary: 'Old.',
                tags: ['CSS'],
                content: '<p>Old body.</p>',
            },
            {
                slug: 'newer',
                title: 'Newer & better',
                date: '2026-05-01',
                summary: 'New.',
                tags: ['Cloudflare Workers', 'CSS'],
                readingMinutes: 4,
                content:
                    '<h2>Why</h2><p>Because <a href="https://x.dev/">a link</a> &amp; <code>code</code>.</p><ul><li>one</li><li>two</li></ul><pre>a &lt; b</pre>',
            },
        ],
    },
    '/experience-data.json': {
        experience: [
            {
                role: 'Software Engineer',
                company: 'Deere & Company',
                startDate: '2021',
                endDate: null,
                current: true,
                summary: 'Parts order management.',
                highlights: ['APIs'],
                technologies: ['Java'],
            },
            {
                role: 'Business Analyst',
                company: 'Deere & Company',
                startDate: '2013',
                endDate: '2021',
                current: false,
                summary: 'Analytics.',
                highlights: [],
                technologies: [],
            },
        ],
        education: [
            {
                degree: 'B.A. Information Systems',
                institution: 'St. Ambrose University',
                startDate: null,
                endDate: '2009',
                highlights: [],
            },
        ],
    },
};

const fetchMock = vi.fn(async url => {
    const path = new URL(url).pathname;
    return path in FILES ? Response.json(FILES[path]) : new Response('missing', { status: 404 });
});

const activity = { repoName: 'guess', type: 'push', message: 'feat: a thing' };
const stats = { generatedAt: '2026-11-12T00:00:00Z', api: { last24h: null, last7d: null } };
const deps = {
    getActivity: vi.fn(async () => ({ ok: true, activity, cached: false })),
    getStats: vi.fn(async () => ({ ok: true, stats, cached: false })),
};

afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockClear();
});

/** One JSON-RPC call to the server; the reply is a server-sent event with one data line. */
async function rpc(method, params, { env = {}, dependencies = deps } = {}) {
    vi.stubGlobal('fetch', fetchMock);
    const request = new Request('https://andernet.dev/mcp', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const response = await handleMcp(request, env, { waitUntil() {} }, dependencies);
    const text = await response.text();
    const data = text
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => JSON.parse(line.slice(5)))
        .at(-1);
    return { response, message: data };
}

const call = async (name, args = {}, options) => {
    const { message } = await rpc('tools/call', { name, arguments: args }, options);
    const text = message.result.content[0].text;
    return {
        isError: Boolean(message.result.isError),
        text,
        data: message.result.isError ? null : JSON.parse(text),
    };
};

const TOOLS = [
    'get_profile',
    'list_projects',
    'get_project',
    'list_experience',
    'list_posts',
    'get_post',
    'get_recent_activity',
    'get_site_stats',
];

describe('the MCP server', () => {
    it('answers initialize with its name and the tools capability', async () => {
        const { message } = await rpc('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
        });
        expect(message.result.serverInfo.name).toBe('andernet-portfolio');
        expect(message.result.capabilities.tools).toBeDefined();
    });

    it('lists exactly the read-only tools, each with a description', async () => {
        const { message } = await rpc('tools/list');
        const tools = message.result.tools;
        expect(tools.map(tool => tool.name).sort()).toEqual([...TOOLS].sort());
        for (const tool of tools) expect(tool.description.length).toBeGreaterThan(20);
    });

    it('get_profile names the current role from the experience data', async () => {
        const { data } = await call('get_profile');
        expect(data.name).toBe('Matthew Anderson');
        expect(data.role).toBe('Software Engineer at Deere & Company');
        expect(data.llms_txt).toBe('https://andernet.dev/llms.txt');
    });

    describe('projects', () => {
        it('lists every project with links to its page or its source', async () => {
            const { data } = await call('list_projects');
            expect(data.map(project => project.name)).toEqual(['health', 'minecraft']);
            // "health" has a long description, so it has a page; "minecraft" has neither it nor highlights
            expect(data[0].url).toBe('https://andernet.dev/projects/health/');
            expect(data[1].url).toBe('https://github.com/and3rn3t/minecraft');
        });

        it('filters by category and by technology, ignoring case', async () => {
            expect(
                (await call('list_projects', { category: 'health & wellness' })).data
            ).toHaveLength(1);
            const byTech = (await call('list_projects', { technology: 'docker' })).data;
            expect(byTech.map(project => project.name)).toEqual(['minecraft']);
            expect((await call('list_projects', { technology: 'Rust' })).data).toEqual([]);
        });

        it.each(['health', 'HEALTH', 'Health Analytics Platform'])(
            'get_project finds a project by %s',
            async name => {
                const { data } = await call('get_project', { name });
                expect(data.title).toBe('Health Analytics Platform');
                expect(data.overview).toBe('The long write-up.');
                expect(data.highlights).toEqual(['Live deployment', 'On-device data']);
                expect(data.metrics).toEqual([{ value: '30 fps', label: 'depth stream' }]);
                expect(data.live_demo).toBe('https://health.andernet.dev');
            }
        );

        it('get_project says which projects exist when the name is wrong', async () => {
            const { isError, text } = await call('get_project', { name: 'nope' });
            expect(isError).toBe(true);
            expect(text).toContain('No project called "nope"');
            expect(text).toContain('health, minecraft');
        });
    });

    it('list_experience gives roles newest first, with "present" for the current one', async () => {
        const { data } = await call('list_experience');
        expect(data.experience[0]).toMatchObject({
            role: 'Software Engineer',
            from: '2021',
            to: 'present',
        });
        expect(data.experience[1].to).toBe('2021');
        expect(data.education[0].institution).toBe('St. Ambrose University');
    });

    describe('posts', () => {
        it('lists newest first, with a url, and filters by tag', async () => {
            const all = (await call('list_posts')).data;
            expect(all.map(post => post.slug)).toEqual(['newer', 'older']);
            expect(all[0].url).toBe('https://andernet.dev/posts/newer/');
            const tagged = (await call('list_posts', { tag: 'cloudflare workers' })).data;
            expect(tagged.map(post => post.slug)).toEqual(['newer']);
        });

        it('get_post returns the body as plain text with its structure', async () => {
            const { data } = await call('get_post', { slug: 'newer' });
            expect(data.title).toBe('Newer & better');
            expect(data.text).toBe(
                '## Why\n\nBecause a link (https://x.dev/) & code.\n\n- one\n- two\n\n```\na < b\n```'
            );
        });

        it('get_post lists the slugs when the slug is wrong', async () => {
            const { isError, text } = await call('get_post', { slug: 'missing' });
            expect(isError).toBe(true);
            expect(text).toContain('newer, older');
        });
    });

    describe('get_recent_activity', () => {
        it('returns what the Worker found', async () => {
            expect((await call('get_recent_activity')).data).toEqual(activity);
        });

        it('says so, as a tool error, when there is none', async () => {
            const dependencies = {
                getActivity: async () => ({ ok: false, error: 'no_activity', status: 404 }),
            };
            const { isError, text } = await call('get_recent_activity', {}, { dependencies });
            expect(isError).toBe(true);
            expect(text).toContain('no_activity');
        });
    });

    // Every tool goes through one wrapper in createServer; these drive real calls (the reply is
    // read to the end by rpc) so removing the wrapper, or counting a failure as a success, fails
    describe('metrics', () => {
        const withMetrics = () => {
            const METRICS = { writeDataPoint: vi.fn() };
            return { METRICS, options: { env: { METRICS } } };
        };
        const points = METRICS => METRICS.writeDataPoint.mock.calls.map(([point]) => point);

        it('records exactly one ok point for a tool call that succeeds', async () => {
            const { METRICS, options } = withMetrics();
            await call('list_posts', {}, options);
            expect(points(METRICS)).toEqual([
                {
                    indexes: ['list_posts'],
                    blobs: ['tool', 'ok'],
                    doubles: [0, expect.any(Number)],
                },
            ]);
        });

        it('records an error point when the tool returns isError', async () => {
            const { METRICS, options } = withMetrics();
            const { isError } = await call('get_project', { name: 'nope' }, options);
            expect(isError).toBe(true);
            expect(points(METRICS)).toHaveLength(1);
            expect(points(METRICS)[0]).toMatchObject({
                indexes: ['get_project'],
                blobs: ['tool', 'error'],
            });
        });

        it('records an error point, once, when the handler throws', async () => {
            const { METRICS, options } = withMetrics();
            const dependencies = {
                getActivity: async () => {
                    throw new Error('boom');
                },
            };
            await rpc(
                'tools/call',
                { name: 'get_recent_activity', arguments: {} },
                {
                    ...options,
                    dependencies,
                }
            );
            expect(points(METRICS)).toHaveLength(1);
            expect(points(METRICS)[0]).toMatchObject({
                indexes: ['get_recent_activity'],
                blobs: ['tool', 'error'],
            });
        });

        it('records nothing for initialize or tools/list', async () => {
            const { METRICS, options } = withMetrics();
            await rpc(
                'initialize',
                {
                    protocolVersion: '2025-06-18',
                    capabilities: {},
                    clientInfo: { name: 't', version: '1' },
                },
                options
            );
            await rpc('tools/list', undefined, options);
            expect(METRICS.writeDataPoint).not.toHaveBeenCalled();
        });
    });

    it('reports a content outage as a JSON-RPC error rather than hanging or returning junk', async () => {
        vi.stubGlobal('fetch', async () => new Response('down', { status: 503 }));
        const request = new Request('https://andernet.dev/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 9,
                method: 'tools/call',
                params: { name: 'list_posts', arguments: {} },
            }),
        });
        const text = await (await handleMcp(request, {}, { waitUntil() {} }, deps)).text();
        const message = JSON.parse(
            text
                .split('\n')
                .find(line => line.startsWith('data:'))
                .slice(5)
        );
        expect(message.error ?? message.result.isError).toBeTruthy();
    });

    it('reads content from SITE_ORIGIN when it is set, and asks the edge to cache it', async () => {
        await call('list_posts', {}, { env: { SITE_ORIGIN: 'https://preview.example' } });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://preview.example/posts-data.json');
        expect(init.cf).toEqual({ cacheTtl: 300, cacheEverything: true });
    });

    it('refuses GET: the server is stateless and has no event stream to offer', async () => {
        const response = await handleMcp(
            new Request('https://andernet.dev/mcp'),
            {},
            { waitUntil() {} },
            deps
        );
        expect(response.status).toBe(405);
    });
});

describe('site data', () => {
    it('loadJson throws on an HTTP error, naming the file', async () => {
        vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
        await expect(loadJson('/posts-data.json')).rejects.toThrow('/posts-data.json: HTTP 500');
    });

    it.each([
        ['<p>One</p><p>Two</p>', 'One\n\nTwo'],
        ['<h3>Head</h3><p>Text</p>', '## Head\n\nText'],
        ['<ul><li>a</li><li>b</li></ul>', '- a\n- b'],
        ['x<br>y<br/>z', 'x\ny\nz'],
        ['<a href="/p/" class="k">link</a>', 'link (/p/)'],
        [
            '<p>1 &lt; 2 &amp;&amp; 3 &gt; 2, &quot;q&quot; &#39;s&#39;</p>',
            `1 < 2 && 3 > 2, "q" 's'`,
        ],
        ['<p>a</p>\n\n\n\n<p>b</p>', 'a\n\nb'],
        ['<span>no blocks</span>', 'no blocks'],
        // The posts write their anchors with single quotes; keep the destination either way
        ["<a href='https://x.dev/a'>single</a>", 'single (https://x.dev/a)'],
        ['<a class="k" href="/p/" target="_blank">double</a>', 'double (/p/)'],
        ["<a target='_blank' href='/q/'>attrs first</a>", 'attrs first (/q/)'],
        ['<a name="anchor">no href</a>', 'no href'],
    ])('htmlToText(%j)', (html, expected) => {
        expect(htmlToText(html)).toBe(expected);
    });

    // Removing a tag can leave a new one behind: strip until nothing changes
    it.each([
        '<<b>script>alert(1)<</b>/script>',
        '<scr<b></b>ipt src=x>hi',
        '<<<i>b>i>x</i>',
        '<img src=x onerror=alert(1)//',
        '<scr<scr<b>ipt>ipt>alert(1)',
    ])('htmlToText leaves no tag behind for %j', html => {
        expect(htmlToText(html)).not.toMatch(/<[^>]+>/);
    });

    it('keeps entity-escaped markup as text, because it is text about markup', () => {
        expect(htmlToText('<p>use &lt;script&gt; sparingly, and &amp;lt; is an entity</p>')).toBe(
            'use <script> sparingly, and &lt; is an entity'
        );
    });

    // The real posts: every link in the source survives into the text, whatever its quotes
    it('keeps every link in the published posts', () => {
        const { posts } = JSON.parse(
            readFileSync(join(import.meta.dirname, '..', '..', 'posts-data.json'), 'utf8')
        );
        let links = 0;
        for (const post of posts) {
            const text = htmlToText(post.content);
            for (const [, , href] of post.content.matchAll(/<a\s[^>]*?href=(["'])(.*?)\1/g)) {
                links++;
                expect(text, `${post.slug}: ${href}`).toContain(`(${href})`);
            }
        }
        expect(links).toBeGreaterThan(0);
    });
});
