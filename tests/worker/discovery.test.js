/**
 * The agent-discovery documents (worker/discovery.js): their content types, their shapes, and
 * that they agree with each other and with what the Worker actually serves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    SKILL_MD,
    aiCatalog,
    apiCatalog,
    discoveryResponse,
    openApi,
    serverCard,
    sha256Digest,
    skillsIndex,
} from '../../worker/discovery.js';
import { handleMcp } from '../../worker/mcp.js';

const read = file => readFileSync(join(import.meta.dirname, '..', '..', file), 'utf8');
const get = path => discoveryResponse(path, 'GET');

const PATHS = {
    apiCatalog: '/.well-known/api-catalog',
    serverCard: '/.well-known/mcp/server-card.json',
    skillsIndex: '/.well-known/agent-skills/index.json',
    skill: '/.well-known/agent-skills/andernet-portfolio/SKILL.md',
    aiCatalog: '/.well-known/ai-catalog.json',
    openApi: '/api/openapi.json',
};

describe('every document', () => {
    it.each(Object.entries(PATHS))(
        '%s is public, cacheable and allows any origin',
        async (_name, path) => {
            const response = await get(path);
            expect(response.status).toBe(200);
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
            expect(response.headers.get('Cache-Control')).toMatch(/max-age=\d+/);
        }
    );

    it('answers HEAD like GET, OPTIONS with the allowed methods, and refuses writes', async () => {
        expect((await discoveryResponse(PATHS.apiCatalog, 'HEAD')).status).toBe(200);
        const options = await discoveryResponse(PATHS.apiCatalog, 'OPTIONS');
        expect(options.headers.get('Access-Control-Allow-Methods')).toContain('GET');
        const post = await discoveryResponse(PATHS.apiCatalog, 'POST');
        expect(post.status).toBe(405);
        expect(post.headers.get('Allow')).toContain('GET');
    });

    // The lookup is by exact path, with own keys only: Object.prototype is not a document
    it.each([
        '/',
        '/mcp',
        '/.well-known/',
        '/.well-known/security.txt',
        '/.well-known/api-catalog/',
        '/constructor',
        '/__proto__',
        '/toString',
        '/hasOwnProperty',
    ])('does not claim %s', async path => {
        expect(await discoveryResponse(path, 'GET')).toBeNull();
    });

    it('serves the OpenAPI document without the /api prefix too (the workers.dev address)', async () => {
        expect((await get('/openapi.json')).status).toBe(200);
    });
});

describe('API catalog (RFC 9727)', () => {
    it('is application/linkset+json with a linkset', async () => {
        const response = await get(PATHS.apiCatalog);
        expect(response.headers.get('Content-Type')).toBe('application/linkset+json');
        const { linkset } = await response.json();
        expect(linkset).toHaveLength(1);
        expect(linkset[0].anchor).toBe('https://andernet.dev/api');
    });

    it('points service-desc at the OpenAPI document and status at the health check', () => {
        const [entry] = apiCatalog().linkset;
        expect(entry['service-desc'][0].href).toBe('https://andernet.dev/api/openapi.json');
        expect(entry.status[0].href).toBe('https://andernet.dev/api/health');
    });
});

describe('OpenAPI document', () => {
    it('is OpenAPI 3.1 and names the live server', () => {
        const api = openApi();
        expect(api.openapi).toBe('3.1.0');
        expect(api.servers[0].url).toBe('https://andernet.dev/api');
    });

    // Every path the Worker routes under /api must be documented, and nothing else
    it('documents every API path the Worker serves', () => {
        const source = read('worker/index.js');
        const served = [...source.matchAll(/path (?:===|!==) '(\/[a-z-]+)'/g)].map(m => m[1]);
        expect(served.sort()).toEqual([
            '/activity',
            '/csp-report',
            '/edge',
            '/guestbook',
            '/health',
            '/presence',
            '/stats',
            '/views',
        ]);
        expect(Object.keys(openApi().paths).sort()).toEqual(served.sort());
    });

    it('gives every operation a unique operationId', () => {
        const ids = Object.values(openApi().paths).flatMap(item =>
            Object.values(item).map(operation => operation.operationId)
        );
        expect(ids.every(Boolean)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('says the guestbook POST needs a token, as the handler requires', () => {
        const body =
            openApi().paths['/guestbook'].post.requestBody.content['application/json'].schema;
        expect(body.required).toEqual(['name', 'message', 'token']);
        expect(body.properties.name.maxLength).toBe(60);
        expect(body.properties.message.maxLength).toBe(500);
    });
});

describe('MCP server card', () => {
    it('names the server and the endpoint', () => {
        const card = serverCard();
        expect(card.serverInfo.name).toBe('andernet-portfolio');
        expect(card.serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(card.transport).toEqual({
            type: 'streamable-http',
            endpoint: 'https://andernet.dev/mcp',
        });
    });

    it('lists the tools the server really has', async () => {
        vi.stubGlobal('fetch', vi.fn());
        const request = new Request('https://andernet.dev/mcp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json, text/event-stream',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        const text = await (await handleMcp(request, {}, { waitUntil() {} }, {})).text();
        const line = text.split('\n').find(l => l.startsWith('data:'));
        const real = JSON.parse(line.slice(5)).result.tools.map(tool => tool.name);
        vi.unstubAllGlobals();
        expect([...serverCard().tools].sort()).toEqual(real.sort());
    });
});

describe('agent skills index', () => {
    it('uses the v0.2.0 schema and lists the portfolio skill by absolute URL', async () => {
        const index = await skillsIndex();
        expect(index.$schema).toBe('https://schemas.agentskills.io/discovery/0.2.0/schema.json');
        expect(index.skills).toHaveLength(1);
        expect(index.skills[0]).toMatchObject({
            name: 'andernet-portfolio',
            type: 'skill-md',
            url: `https://andernet.dev${PATHS.skill}`,
        });
        expect(index.skills[0].name).toMatch(/^[a-z0-9-]+$/);
    });

    // Agents check the digest against the file they download, so it is of the bytes served
    it('digests exactly the SKILL.md bytes the server sends', async () => {
        const served = await (await get(PATHS.skill)).arrayBuffer();
        const hash = await crypto.subtle.digest('SHA-256', served);
        const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        expect((await skillsIndex()).skills[0].digest).toBe(`sha256:${hex}`);
        expect((await skillsIndex()).skills[0].digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('serves SKILL.md as Markdown with front matter naming the skill', async () => {
        const response = await get(PATHS.skill);
        expect(response.headers.get('Content-Type')).toMatch(/^text\/markdown/);
        const text = await response.text();
        expect(text).toBe(SKILL_MD);
        expect(text).toMatch(/^---\nname: andernet-portfolio\ndescription: ".+"\n---\n/);
    });

    // A skill loader parses the front matter as YAML. A plain scalar cannot contain ": ", and
    // the description does, so it must be quoted (a JSON string is a valid YAML scalar).
    it('SKILL.md front matter is valid YAML: a quoted description', () => {
        const [, front] = SKILL_MD.match(/^---\n([\s\S]*?)\n---\n/);
        const fields = Object.fromEntries(
            front
                .split('\n')
                .map(line => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(': ') + 2)])
        );
        expect(fields.name).toBe('andernet-portfolio');
        expect(fields.description.startsWith('"')).toBe(true);
        const description = JSON.parse(fields.description);
        expect(description).toContain('(andernet.dev): ');
        expect(description.length).toBeGreaterThan(40);
        expect(Object.keys(fields).sort()).toEqual(['description', 'name']);
    });

    it('SKILL.md mentions every tool', () => {
        for (const tool of serverCard().tools) expect(SKILL_MD).toContain(`\`${tool}\``);
    });

    it('sha256Digest of a known string matches the published test vector', async () => {
        expect(await sha256Digest('abc')).toBe(
            'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
        );
    });
});

describe('ARD manifest', () => {
    const catalog = aiCatalog();

    it('has the required top-level fields', () => {
        expect(catalog.specVersion).toBe('1.0');
        expect(catalog.host.identifier).toBe('did:web:andernet.dev');
        expect(catalog.entries.length).toBeGreaterThan(0);
    });

    it('gives each entry a urn:air identifier, exactly one of url or data, and 2-5 queries', () => {
        for (const entry of catalog.entries) {
            expect(entry.identifier).toMatch(/^urn:air:andernet\.dev:[a-z]+:[a-z-]+$/);
            expect(Boolean(entry.url) !== Boolean(entry.data)).toBe(true);
            expect(entry.representativeQueries.length).toBeGreaterThanOrEqual(2);
            expect(entry.representativeQueries.length).toBeLessThanOrEqual(5);
        }
        const ids = catalog.entries.map(entry => entry.identifier);
        expect(new Set(ids).size).toBe(ids.length);
    });

    // A catalog that points at a document nobody serves is worse than none
    it('every entry URL is a document this Worker serves', async () => {
        for (const entry of catalog.entries) {
            const { pathname } = new URL(entry.url);
            const response = await get(pathname);
            expect(response, entry.url).not.toBeNull();
            expect(response.status).toBe(200);
        }
    });
});

describe('the zone routes', () => {
    const routes = [...read('wrangler.toml').matchAll(/pattern = "andernet\.dev([^"]*)"/g)].map(
        m => m[1]
    );

    // A document the Worker serves but the zone does not route to it would 404 from GitHub Pages
    it('route every discovery document and the MCP endpoint to the Worker', () => {
        const covered = path =>
            routes.some(route =>
                route.endsWith('*') ? path.startsWith(route.slice(0, -1)) : path === route
            );
        for (const path of [...Object.values(PATHS), '/mcp']) {
            expect(covered(path), `${path} is not routed to the Worker`).toBe(true);
        }
    });

    it('leave the rest of /.well-known/ (the managed security.txt) alone', () => {
        expect(routes).not.toContain('/.well-known/*');
        expect(
            routes.some(route => '/.well-known/security.txt'.startsWith(route.replace(/\*$/, '')))
        ).toBe(false);
    });
});
