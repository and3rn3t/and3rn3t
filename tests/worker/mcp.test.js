/**
 * The MCP server (worker/mcp.js) and the site data it reads (worker/site-data.js), driven the
 * way a client does: JSON-RPC over POST. fetch is replaced, so no test touches the network.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVER_VERSION, handleMcp } from '../../worker/mcp.js';
import { PROMPTS } from '../../worker/mcp-content.js';
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

const activity = {
    repo: 'and3rn3t/guess',
    repoName: 'guess',
    repoUrl: 'https://github.com/and3rn3t/guess',
    pushedAt: '2026-11-12T22:09:46Z',
    type: 'push',
    message: 'feat: a thing',
    branch: 'main',
};
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
        structured: message.result.structuredContent,
        text,
        data: message.result.isError ? null : JSON.parse(text),
    };
};

const TOOLS = [
    'get_profile',
    'list_projects',
    'get_project',
    'show_project',
    'show_status',
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
        expect(message.result.capabilities.prompts).toBeDefined();
        expect(message.result.capabilities.resources).toBeDefined();
    });

    it('advertises its icons as files the site ships', async () => {
        const { message } = await rpc('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
        });
        const { icons } = message.result.serverInfo;
        expect(icons.map(icon => icon.mimeType)).toEqual(['image/png', 'image/svg+xml']);
        for (const { src } of icons) {
            expect(src).toMatch(/^https:\/\/andernet\.dev\/icons\//);
            expect(existsSync(new URL(src).pathname.slice(1)), src).toBe(true);
        }
    });

    it('lists exactly the read-only tools, each with a description', async () => {
        const { message } = await rpc('tools/list');
        const tools = message.result.tools;
        expect(tools.map(tool => tool.name).sort()).toEqual([...TOOLS].sort());
        for (const tool of tools) expect(tool.description.length).toBeGreaterThan(20);
    });

    it('moves the server version whenever the tools, prompts or resources change (clients can cache the lists by version)', async () => {
        const names = async (method, key, field = 'name') =>
            (await rpc(method)).message.result[key].map(item => item[field]).sort();
        const tools = await names('tools/list', 'tools');
        const prompts = await names('prompts/list', 'prompts');
        const templates = await names(
            'resources/templates/list',
            'resourceTemplates',
            'uriTemplate'
        );
        // Changing any of them means changing this line, and so choosing the next version
        expect(
            `${SERVER_VERSION}: ${tools.join(' ')} | ${prompts.join(' ')} | ${templates.join(' ')}`
        ).toBe(
            '1.3.0: get_post get_profile get_project get_recent_activity get_site_stats list_experience list_posts list_projects show_project show_status | brief-for-role compare-projects recent-work | portfolio://posts/{slug} portfolio://projects/{name}'
        );
    });

    it('gives every tool a title and read-only annotations (the directory requires both)', async () => {
        const { message } = await rpc('tools/list');
        for (const tool of message.result.tools) {
            expect(tool.title, tool.name).toMatch(/\S/);
            expect(tool.title.length, tool.name).toBeLessThanOrEqual(40);
            expect(tool.name.length).toBeLessThanOrEqual(64);
            expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
            expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
        }
        const open = message.result.tools
            .filter(tool => tool.annotations.openWorldHint)
            .map(tool => tool.name);
        expect(open).toEqual(['get_recent_activity']);
    });

    it('gives every tool an outputSchema with an object at the root', async () => {
        const { message } = await rpc('tools/list');
        for (const tool of message.result.tools) {
            expect(tool.outputSchema?.type, tool.name).toBe('object');
        }
    });

    it.each([
        ['get_profile', {}],
        ['list_projects', {}],
        ['get_project', { name: 'health' }],
        ['show_project', { name: 'health' }],
        ['show_status', {}],
        ['list_experience', {}],
        ['list_posts', {}],
        ['get_post', { slug: 'newer' }],
        ['get_recent_activity', {}],
        ['get_site_stats', {}],
    ])('%s returns structuredContent that is the same JSON as its text', async (name, args) => {
        const { isError, structured, data } = await call(name, args);
        expect(isError).toBe(false);
        expect(structured).toEqual(data);
    });

    it("checks the real published content against every tool's outputSchema", async () => {
        const root = join(import.meta.dirname, '..', '..');
        const real = Object.fromEntries(
            Object.keys(FILES).map(path => [
                path,
                JSON.parse(readFileSync(join(root, path.slice(1)), 'utf8')),
            ])
        );
        const original = { ...FILES };
        Object.assign(FILES, real);
        try {
            const calls = [
                ['list_projects', {}],
                ['list_experience', {}],
                ['list_posts', {}],
                ['get_profile', {}],
            ];
            for (const project of real['/projects-data.json'].projects) {
                calls.push(['get_project', { name: project.name }]);
            }
            for (const post of real['/posts-data.json'].posts) {
                calls.push(['get_post', { slug: post.slug }]);
            }
            for (const [name, args] of calls) {
                const { isError, text } = await call(name, args);
                expect(isError, `${name} ${JSON.stringify(args)}: ${text.slice(0, 200)}`).toBe(
                    false
                );
            }
        } finally {
            Object.assign(FILES, original);
        }
    });

    it.each([
        ['show_project', 'ui://portfolio/project.html', 'app.ontoolresult'],
        ['show_status', 'ui://portfolio/status.html', 'renderStatus'],
    ])(
        '%s is an MCP App: its tool points at a ui:// view that the server can read',
        async (name, uri, marker) => {
            const { message } = await rpc('tools/list');
            const tool = message.result.tools.find(candidate => candidate.name === name);
            expect(tool._meta.ui.resourceUri).toBe(uri);
            expect(tool._meta['ui/resourceUri']).toBe(uri);

            const listed = (await rpc('resources/list')).message.result.resources;
            expect(
                listed
                    .map(resource => resource.uri)
                    .filter(candidate => candidate.startsWith('ui://'))
                    .sort()
            ).toEqual(['ui://portfolio/project.html', 'ui://portfolio/status.html']);
            const resource = listed.find(candidate => candidate.uri === uri);
            expect(resource._meta.ui.domain).toMatch(/^[0-9a-f]{32}\.claudemcpcontent\.com$/);

            const read = (await rpc('resources/read', { uri })).message.result.contents[0];
            expect(read.mimeType).toBe('text/html;profile=mcp-app');
            expect(read.text).toContain(marker);
            expect(read.text).toContain('structuredContent');
            expect(read.text).not.toContain('innerHTML');
        }
    );

    describe('prompts', () => {
        it('lists three prompts, each titled and described, with the arguments they take', async () => {
            const { prompts } = (await rpc('prompts/list')).message.result;
            expect(prompts.map(prompt => prompt.name).sort()).toEqual([
                'brief-for-role',
                'compare-projects',
                'recent-work',
            ]);
            for (const prompt of prompts) {
                expect(prompt.title).toMatch(/\S/);
                expect(prompt.description.length).toBeGreaterThan(20);
            }
            const args = name =>
                prompts.find(prompt => prompt.name === name).arguments?.map(arg => arg.name) ?? [];
            expect(args('brief-for-role')).toEqual(['role']);
            expect(args('compare-projects')).toEqual(['first', 'second']);
            expect(args('recent-work')).toEqual([]);
        });

        it('returns a user message that names the tools to use and quotes what was typed', async () => {
            const { message } = await rpc('prompts/get', {
                name: 'brief-for-role',
                arguments: { role: 'senior iOS engineer' },
            });
            const [first] = message.result.messages;
            expect(first.role).toBe('user');
            expect(first.content.text).toContain('"senior iOS engineer"');
            for (const tool of ['get_profile', 'list_experience', 'get_project']) {
                expect(first.content.text).toContain(tool);
            }
            expect(first.content.text).toContain('State nothing the tools did not return');
        });

        it('takes no arguments for recent-work, and refuses an argument that is too long', async () => {
            const recent = await rpc('prompts/get', { name: 'recent-work' });
            expect(recent.message.result.messages[0].content.text).toContain('get_recent_activity');
            const long = await rpc('prompts/get', {
                name: 'brief-for-role',
                arguments: { role: 'x'.repeat(201) },
            });
            expect(long.message.error).toBeDefined();
        });

        it('every tool a prompt names is a tool the server has', async () => {
            const { message } = await rpc('tools/list');
            const real = new Set(message.result.tools.map(tool => tool.name));
            for (const prompt of PROMPTS) {
                const text = prompt.text({ role: 'r', first: 'a', second: 'b' });
                for (const [name] of text.matchAll(/\b(?:get|list|show)_[a-z_]+\b/g)) {
                    expect(real.has(name), `${prompt.name} names ${name}`).toBe(true);
                }
            }
        });
    });

    describe('resources', () => {
        it('lists every post and project as a Markdown resource', async () => {
            const { resources } = (await rpc('resources/list')).message.result;
            const content = resources.filter(resource => resource.uri.startsWith('portfolio://'));
            expect(content.map(resource => resource.uri).sort()).toEqual([
                'portfolio://posts/newer',
                'portfolio://posts/older',
                'portfolio://projects/health',
                'portfolio://projects/minecraft',
            ]);
            for (const resource of content) expect(resource.mimeType).toBe('text/markdown');
        });

        it('reads a post as Markdown with its title, date, link and text', async () => {
            const { message } = await rpc('resources/read', { uri: 'portfolio://posts/newer' });
            const [content] = message.result.contents;
            expect(content.mimeType).toBe('text/markdown');
            expect(content.text).toMatch(/^# Newer & better\n/);
            expect(content.text).toContain('https://andernet.dev/posts/newer/');
            expect(content.text).toContain('Tags: Cloudflare Workers, CSS');
            expect(content.text).toContain('Because');
        });

        it('reads a project as Markdown from the same data as get_project', async () => {
            const { message } = await rpc('resources/read', { uri: 'portfolio://projects/health' });
            const text = message.result.contents[0].text;
            expect(text).toMatch(/^# Health Analytics Platform\n/);
            expect(text).toContain('The long write-up.');
            expect(text).toContain('Technologies: TypeScript, HealthKit');
            expect(text).toContain('## Highlights');
            expect(text).toContain('- 30 fps depth stream');
        });

        it.each([['portfolio://posts/nope'], ['portfolio://projects/nope']])(
            'answers %s with an error, not an empty document',
            async uri => {
                const { message } = await rpc('resources/read', { uri });
                expect(message.error).toBeDefined();
                expect(message.result).toBeUndefined();
            }
        );

        it('completes a slug from what is typed', async () => {
            const { message } = await rpc('completion/complete', {
                ref: { type: 'ref/resource', uri: 'portfolio://posts/{slug}' },
                argument: { name: 'slug', value: 'ne' },
            });
            expect(message.result.completion.values).toEqual(['newer']);
        });
    });

    it('show_status returns the same data as get_site_stats', async () => {
        expect((await call('show_status')).data).toEqual((await call('get_site_stats')).data);
    });

    it('show_project returns the same data as get_project', async () => {
        const shown = await call('show_project', { name: 'health' });
        const got = await call('get_project', { name: 'health' });
        expect(shown.data).toEqual(got.data);
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
            expect(data.projects.map(project => project.name)).toEqual(['health', 'minecraft']);
            // "health" has a long description, so it has a page; "minecraft" has neither it nor highlights
            expect(data.projects[0].url).toBe('https://andernet.dev/projects/health/');
            expect(data.projects[1].url).toBe('https://github.com/and3rn3t/minecraft');
        });

        it('filters by category and by technology, ignoring case', async () => {
            expect(
                (await call('list_projects', { category: 'health & wellness' })).data.projects
            ).toHaveLength(1);
            const byTech = (await call('list_projects', { technology: 'docker' })).data.projects;
            expect(byTech.map(project => project.name)).toEqual(['minecraft']);
            expect((await call('list_projects', { technology: 'Rust' })).data.projects).toEqual([]);
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
            const all = (await call('list_posts')).data.posts;
            expect(all.map(post => post.slug)).toEqual(['newer', 'older']);
            expect(all[0].url).toBe('https://andernet.dev/posts/newer/');
            const tagged = (await call('list_posts', { tag: 'cloudflare workers' })).data.posts;
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

        it('records "no such project or post" as a success: the tool worked (#318)', async () => {
            const { METRICS, options } = withMetrics();
            for (const [tool, args] of [
                ['get_project', { name: 'nope' }],
                ['show_project', { name: 'nope' }],
                ['get_post', { slug: 'nope' }],
            ]) {
                const { isError } = await call(tool, args, options);
                expect(isError, tool).toBe(true); // the model is still told
            }
            expect(points(METRICS).map(point => point.blobs)).toEqual([
                ['tool', 'ok'],
                ['tool', 'ok'],
                ['tool', 'ok'],
            ]);
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
