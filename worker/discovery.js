/**
 * The documents that let an agent find what this site offers, served from the Worker because
 * GitHub Pages can't send the right content type for an extensionless file (the API catalog
 * must be application/linkset+json).
 *
 *   /.well-known/api-catalog                       RFC 9727 linkset: the REST API and its OpenAPI document
 *   /.well-known/mcp/server-card.json              the MCP server at /mcp (SEP-1649, still a draft)
 *   /.well-known/agent-skills/index.json           Agent Skills discovery index (v0.2.0)
 *   /.well-known/agent-skills/<name>/SKILL.md      the skill the index lists
 *   /.well-known/ai-catalog.json                   ARD manifest tying the above together (v0.9 draft)
 *   /api/openapi.json                              OpenAPI 3.1 for views, guestbook, activity, health
 *
 * All are public and read-only, so every response allows any origin.
 *
 * Workers-compatible: standard fetch/Web Crypto only.
 */

import { SERVER_VERSION } from './mcp.js';
import { SITE_ORIGIN } from './site-data.js';

const SKILL_NAME = 'andernet-portfolio';
const SKILL_PATH = `/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;

const OPENAPI_TYPE = 'application/vnd.oai.openapi+json;version=3.1';

// Quoted (as a JSON string, which is valid YAML): the text has ": " in it, which a plain YAML
// scalar cannot contain, and a skill loader that parses the front matter would reject the file
const SKILL_DESCRIPTION =
    "Read Matthew Anderson's portfolio (andernet.dev): his projects, writing, work history and recent GitHub activity. Use when you need facts about Matthew Anderson or one of his projects.";

export const SKILL_MD = `---
name: ${SKILL_NAME}
description: ${JSON.stringify(SKILL_DESCRIPTION)}
---

# andernet.dev

Matthew Anderson's portfolio. Everything on it is public and read-only.

## Easiest: the MCP server

Connect an MCP client to \`${SITE_ORIGIN}/mcp\` (Streamable HTTP, no authentication). Tools:

- \`get_profile\`: who he is, current role, links
- \`list_projects\` (optional \`category\`, \`technology\`) and \`get_project\` (\`name\`): the projects and their write-ups
- \`list_experience\`: work history and education
- \`list_posts\` (optional \`tag\`) and \`get_post\` (\`slug\`): the technical posts, full text
- \`get_recent_activity\`: the latest public GitHub activity
- \`get_site_stats\`: how the site and API are doing (latency, errors, uptime, Web Vitals, crawler traffic)

## Without MCP

- \`${SITE_ORIGIN}/llms.txt\`: a one-page guide that links every project and post
- Any page as Markdown: request it with \`Accept: text/markdown\`
- \`${SITE_ORIGIN}/api/openapi.json\`: the small REST API (page views, guestbook, activity)

Guestbook writes need a human-solved captcha, so they are not available to agents.
`;

const CORS = { 'Access-Control-Allow-Origin': '*' };

const json = (body, contentType = 'application/json') =>
    new Response(JSON.stringify(body, null, 2), {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=300', ...CORS },
    });

/** "sha256:" and the hex SHA-256 of the text's UTF-8 bytes, which is what the server sends. */
export async function sha256Digest(text) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const hex = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0'));
    return `sha256:${hex.join('')}`;
}

export const apiCatalog = () => ({
    linkset: [
        {
            anchor: `${SITE_ORIGIN}/api`,
            'service-desc': [{ href: `${SITE_ORIGIN}/api/openapi.json`, type: OPENAPI_TYPE }],
            'service-doc': [{ href: `${SITE_ORIGIN}/llms.txt`, type: 'text/plain' }],
            status: [{ href: `${SITE_ORIGIN}/api/health`, type: 'application/json' }],
        },
    ],
});

export const serverCard = () => ({
    serverInfo: {
        name: 'andernet-portfolio',
        title: "Matthew Anderson's portfolio",
        version: SERVER_VERSION,
    },
    description:
        "Read-only tools over Matthew Anderson's portfolio: projects, posts, work history and recent GitHub activity.",
    homepage: `${SITE_ORIGIN}/`,
    transport: { type: 'streamable-http', endpoint: `${SITE_ORIGIN}/mcp` },
    authentication: { required: false },
    capabilities: { tools: {} },
    tools: [
        'get_profile',
        'list_projects',
        'get_project',
        'list_experience',
        'list_posts',
        'get_post',
        'get_recent_activity',
        'get_site_stats',
    ],
});

export const skillsIndex = async () => ({
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
        {
            name: SKILL_NAME,
            type: 'skill-md',
            description:
                "Read Matthew Anderson's portfolio: his projects, writing, work history and recent GitHub activity.",
            url: `${SITE_ORIGIN}${SKILL_PATH}`,
            digest: await sha256Digest(SKILL_MD),
        },
    ],
});

export const aiCatalog = () => ({
    specVersion: '1.0',
    host: { displayName: 'andernet.dev', identifier: 'did:web:andernet.dev' },
    entries: [
        {
            identifier: 'urn:air:andernet.dev:mcp:portfolio',
            displayName: "Matthew Anderson's portfolio (MCP server)",
            type: 'application/mcp-server-card+json',
            url: `${SITE_ORIGIN}/.well-known/mcp/server-card.json`,
            representativeQueries: [
                'What has Matthew Anderson built?',
                'Which of his projects use TypeScript?',
                'Where does Matthew Anderson work and what does he do?',
            ],
        },
        {
            identifier: 'urn:air:andernet.dev:api:portfolio',
            displayName: 'andernet.dev REST API (page views, guestbook, GitHub activity)',
            type: OPENAPI_TYPE,
            url: `${SITE_ORIGIN}/api/openapi.json`,
            representativeQueries: [
                'How many times has the portfolio been viewed?',
                "What was Matthew Anderson's latest GitHub commit?",
            ],
        },
        {
            identifier: 'urn:air:andernet.dev:skill:portfolio',
            displayName: 'Read the portfolio (agent skill)',
            type: 'text/markdown',
            url: `${SITE_ORIGIN}${SKILL_PATH}`,
            representativeQueries: [
                "How do I look up Matthew Anderson's projects?",
                'How can an agent read andernet.dev?',
            ],
        },
    ],
});

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };
const jsonBody = schema => ({ 'application/json': { schema } });

export const openApi = () => ({
    openapi: '3.1.0',
    info: {
        title: 'andernet.dev API',
        version: '1.0.0',
        description:
            "The small API behind Matthew Anderson's portfolio: page views, the guestbook and recent GitHub activity.",
        license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [{ url: `${SITE_ORIGIN}/api` }],
    paths: {
        '/health': {
            get: {
                operationId: 'getHealth',
                summary: 'Is the API up?',
                responses: {
                    200: {
                        description: 'Up',
                        content: jsonBody({
                            type: 'object',
                            properties: { ok: { type: 'boolean', const: true } },
                        }),
                    },
                },
            },
        },
        '/edge': {
            get: {
                operationId: 'getEdge',
                summary:
                    'Where this request was served: the Cloudflare location and the Worker version',
                responses: {
                    200: {
                        description: "Facts about the caller's own connection; nothing is stored",
                        content: jsonBody({
                            type: 'object',
                            properties: {
                                colo: {
                                    type: ['string', 'null'],
                                    description: 'IATA code of the Cloudflare location',
                                },
                                httpProtocol: { type: ['string', 'null'] },
                                tlsVersion: { type: ['string', 'null'] },
                                version: {
                                    type: ['string', 'null'],
                                    description: 'The deployed Worker version',
                                },
                            },
                        }),
                    },
                },
            },
        },
        '/stats': {
            get: {
                operationId: 'getStats',
                summary: 'How the site and API are doing, cached for five minutes',
                description:
                    'Aggregates only. Every section may be null when there is nothing to report; a null is never a zero.',
                responses: {
                    200: {
                        description: 'The numbers behind https://andernet.dev/status/',
                        content: jsonBody({
                            type: 'object',
                            properties: {
                                generatedAt: { type: 'string', format: 'date-time' },
                                api: {
                                    type: 'object',
                                    description:
                                        'last24h and last7d: errorRate, p50Ms, p95Ms (each may be null). No request counts.',
                                },
                                mcp: {
                                    type: ['array', 'null'],
                                    description:
                                        'tool, calls, errors for each MCP tool used in 7 days',
                                },
                                clients: {
                                    type: ['object', 'null'],
                                    description:
                                        'agentShare: the share of API calls made by agents',
                                },
                                uptime: {
                                    type: ['object', 'null'],
                                    description:
                                        'lastProbe ({ at, ok }) and one entry per day with probes and ok',
                                },
                                vitals: {
                                    type: ['object', 'null'],
                                    description:
                                        'Real visitors only: lcpMs, inpMs, cls, ttfbMs at p75',
                                },
                                crawlers: {
                                    type: ['array', 'null'],
                                    description: 'Verified crawler requests by category, 7 days',
                                },
                                edge: {
                                    type: ['object', 'null'],
                                    description:
                                        'answeredAtEdge: the share of page and file requests answered without asking GitHub',
                                },
                            },
                        }),
                    },
                    503: { description: 'Stats are not available', content: jsonBody(errorSchema) },
                },
            },
        },
        '/views': {
            get: {
                operationId: 'getViews',
                summary: 'The view count of a page',
                parameters: [
                    {
                        name: 'page',
                        in: 'query',
                        schema: { type: 'string', enum: ['home'], default: 'home' },
                    },
                ],
                responses: {
                    200: {
                        description: 'The count',
                        content: jsonBody({
                            type: 'object',
                            properties: {
                                page: { type: 'string' },
                                views: { type: 'integer' },
                            },
                        }),
                    },
                    400: { description: 'Unknown page', content: jsonBody(errorSchema) },
                },
            },
            post: {
                operationId: 'recordView',
                summary: 'Count one view of a page. Browsers call this once per visit.',
                parameters: [
                    {
                        name: 'page',
                        in: 'query',
                        schema: { type: 'string', enum: ['home'], default: 'home' },
                    },
                ],
                responses: {
                    200: { description: 'The new count' },
                    400: { description: 'Unknown page', content: jsonBody(errorSchema) },
                },
            },
        },
        '/guestbook': {
            get: {
                operationId: 'listGuestbook',
                summary: 'The latest guestbook entries, newest first (at most 50)',
                responses: {
                    200: {
                        description: 'Entries',
                        content: jsonBody({
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string' },
                                    message: { type: 'string' },
                                    date: { type: 'string', format: 'date-time' },
                                },
                            },
                        }),
                    },
                },
            },
            post: {
                operationId: 'signGuestbook',
                summary:
                    'Sign the guestbook. Needs a Cloudflare Turnstile token, so only a browser a person is using can call it.',
                requestBody: {
                    required: true,
                    content: jsonBody({
                        type: 'object',
                        required: ['name', 'message', 'token'],
                        properties: {
                            name: { type: 'string', maxLength: 60 },
                            message: { type: 'string', maxLength: 500 },
                            token: { type: 'string', description: 'A Turnstile response token' },
                        },
                    }),
                },
                responses: {
                    201: { description: 'Saved' },
                    400: { description: 'Missing fields', content: jsonBody(errorSchema) },
                    403: { description: 'The captcha failed', content: jsonBody(errorSchema) },
                    429: {
                        description: 'One entry per minute per address',
                        content: jsonBody(errorSchema),
                    },
                },
            },
        },
        '/activity': {
            get: {
                operationId: 'getRecentActivity',
                summary:
                    "Matthew Anderson's most recent public GitHub activity, cached for five minutes",
                responses: {
                    200: {
                        description: 'The activity',
                        content: jsonBody({
                            type: 'object',
                            properties: {
                                repo: { type: 'string' },
                                repoName: { type: 'string' },
                                repoUrl: { type: 'string', format: 'uri' },
                                type: {
                                    type: 'string',
                                    enum: ['push', 'create', 'pr', 'release', 'star'],
                                },
                                message: { type: ['string', 'null'] },
                                branch: { type: ['string', 'null'] },
                                pushedAt: { type: 'string', format: 'date-time' },
                            },
                        }),
                    },
                    404: { description: 'No recent activity', content: jsonBody(errorSchema) },
                    502: { description: 'GitHub is not answering', content: jsonBody(errorSchema) },
                },
            },
        },
    },
});

/**
 * The response for a discovery path, or null when the path is not one of them.
 * @param {string} pathname - the request's own pathname, with any /api prefix still on
 * @param {string} method
 * @returns {Promise<Response | null>}
 */
export async function discoveryResponse(pathname, method) {
    const known = {
        '/.well-known/api-catalog': () => json(apiCatalog(), 'application/linkset+json'),
        '/.well-known/mcp/server-card.json': () => json(serverCard()),
        '/.well-known/agent-skills/index.json': async () => json(await skillsIndex()),
        '/.well-known/ai-catalog.json': () => json(aiCatalog()),
        '/api/openapi.json': () => json(openApi(), OPENAPI_TYPE),
        // Without the prefix: the workers.dev address has none
        '/openapi.json': () => json(openApi(), OPENAPI_TYPE),
        [SKILL_PATH]: () =>
            new Response(SKILL_MD, {
                headers: {
                    'Content-Type': 'text/markdown; charset=utf-8',
                    'Cache-Control': 'public, max-age=300',
                    ...CORS,
                },
            }),
    };
    // Own keys only: "/constructor" and "/__proto__" must not find Object's members
    if (!Object.hasOwn(known, pathname)) return null;
    const build = known[pathname];
    if (method === 'OPTIONS')
        return new Response(null, {
            headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' },
        });
    if (method !== 'GET' && method !== 'HEAD')
        return new Response('Method not allowed', {
            status: 405,
            headers: { Allow: 'GET, HEAD, OPTIONS' },
        });
    return build();
}
