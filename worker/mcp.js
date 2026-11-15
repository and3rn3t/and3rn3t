/**
 * The portfolio as an MCP server: read-only tools over the site's own content, at
 * https://andernet.dev/mcp (Streamable HTTP, stateless: every request gets a fresh server).
 *
 * Nothing here writes. The guestbook needs a Turnstile token, so it is not a tool.
 *
 * Workers-compatible: no Node built-ins.
 */

import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';
import {
    RESOURCE_MIME_TYPE,
    registerAppResource,
    registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import {
    SITE_ORIGIN,
    htmlToText,
    loadExperience,
    loadPosts,
    loadProjects,
    projectUrl,
} from './site-data.js';
import { PROJECT_VIEW_HTML } from './mcp-app-view.js';
import { STATUS_VIEW_HTML } from './mcp-app-status.js';
import { recordTool } from './telemetry.js';

const SERVER_NAME = 'andernet-portfolio';
// Bump it (minor) whenever a tool is added, removed or changes its schema: clients can keep a server's
// tool list until its version changes, and a new tool at the same version may never reach them
// (tests/worker/mcp.test.js pins the two together).
export const SERVER_VERSION = '1.2.0';

/**
 * A result for clients that read typed data (structuredContent, checked against the tool's
 * outputSchema) and for clients that only read text: the text is the same JSON.
 */
const asData = data => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
});
const asError = text => ({ isError: true, content: [{ type: 'text', text }] });

/**
 * "There is no such project or post" is an answer, not a failure of the tool: the model is told
 * (isError, so it retries with a listed name), but the call is recorded as a success, or a correct
 * answer would show on /status/ as an error (the weekly eval asks for a project that does not exist).
 */
const notFoundResults = new WeakSet();
const asNotFound = text => {
    const result = asError(text);
    notFoundResults.add(result);
    return result;
};

/** The project matching a name, a page slug or a display name, ignoring case. */
function findProject(projects, wanted) {
    const key = wanted.trim().toLowerCase();
    return projects.find(
        ({ metadata, view }) =>
            metadata.name.toLowerCase() === key ||
            view.pageSlug === key ||
            view.displayName.toLowerCase() === key
    );
}

const PROJECT_VIEW_URI = 'ui://portfolio/project.html';
const STATUS_VIEW_URI = 'ui://portfolio/status.html';
// Claude derives an app's origin from the server URL: first 32 hex of sha256("https://andernet.dev/mcp").
const PROJECT_VIEW_DOMAIN = '71442e512ec275182b8e0b135be88382.claudemcpcontent.com';

const summarise = ({ metadata, view }) => ({
    name: metadata.name,
    title: view.displayName,
    description: view.description,
    category: view.category ?? null,
    status: view.status ?? null,
    technologies: view.technologies,
    url: projectUrl(view),
    source: view.htmlUrl,
});

const projectDetail = found => ({
    ...summarise(found),
    overview: found.view.longDescription ?? found.view.description,
    highlights: found.view.highlights,
    metrics: found.view.metrics,
    live_demo: found.view.homepage ?? null,
});

// What each tool returns, as advertised in tools/list. Objects at the root (a list is wrapped),
// because clients of the older protocol era cannot take a bare array as structured content.
const text = z.string();
const maybeText = z.string().nullish();
const textList = z.array(z.string());
const projectSummarySchema = z.object({
    name: text,
    title: text,
    description: maybeText,
    category: maybeText,
    status: maybeText,
    technologies: textList,
    url: maybeText,
    source: maybeText,
});
const projectDetailSchema = projectSummarySchema.extend({
    overview: maybeText,
    highlights: z.array(z.string()).nullish(),
    metrics: z.array(z.object({ value: text, label: text })).nullish(),
    live_demo: maybeText,
});
const OUTPUT = {
    profile: z.object({
        name: text,
        handle: text,
        role: maybeText,
        about: text,
        site: text,
        llms_txt: text,
        github: text,
        linkedin: text,
        email: text,
    }),
    projects: z.object({ projects: z.array(projectSummarySchema) }),
    project: projectDetailSchema,
    experience: z.object({
        experience: z.array(
            z.looseObject({
                role: text,
                company: text,
                from: maybeText,
                to: maybeText,
                summary: maybeText,
                highlights: z.array(z.string()).nullish(),
                technologies: z.array(z.string()).nullish(),
            })
        ),
        education: z.array(
            z.looseObject({
                degree: maybeText,
                institution: maybeText,
                from: maybeText,
                to: maybeText,
                highlights: z.array(z.string()).nullish(),
            })
        ),
    }),
    posts: z.object({
        posts: z.array(
            z.object({
                slug: text,
                title: text,
                date: text,
                summary: maybeText,
                tags: textList,
                reading_minutes: z.number().nullish(),
                url: text,
            })
        ),
    }),
    post: z.object({
        slug: text,
        title: text,
        date: text,
        tags: textList,
        url: text,
        text,
    }),
    activity: z.looseObject({
        repo: text,
        repoName: text,
        repoUrl: text,
        pushedAt: maybeText,
        type: text,
        message: maybeText,
        branch: maybeText,
    }),
    // The sections are documented in worker/stats.js; any can be null, so only the stamp is fixed.
    stats: z.looseObject({ generatedAt: text }),
};

/**
 * @param {object} env - the Worker's bindings (SITE_ORIGIN overrides where content is read)
 * @param {{ getActivity: () => Promise<{ ok: boolean, activity?: object, error?: string }>, getStats: () => Promise<{ ok: boolean, stats?: object, error?: string }> }} deps
 */
export function createServer(env, deps) {
    const server = new McpServer({
        name: SERVER_NAME,
        title: "Matthew Anderson's portfolio",
        version: SERVER_VERSION,
    });

    // Every tool only reads, so Claude can run them without asking each time. A tool that
    // reaches outside this site's own data sets openWorldHint in its own config.
    const READ_ONLY = {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    };

    // Every tool goes through here, so each call is timed and recorded once (a tool that
    // throws, or returns isError, counts as an error). Handlers get the SDK's arguments as is.
    const registerTool = (name, config, handler) =>
        server.registerTool(
            name,
            { ...config, annotations: { ...READ_ONLY, ...config.annotations } },
            async (...args) => {
                const started = Date.now();
                let ok = false;
                try {
                    const result = await handler(...args);
                    ok = !result?.isError || notFoundResults.has(result);
                    return result;
                } finally {
                    recordTool(env, { tool: name, ok, ms: Date.now() - started });
                }
            }
        );

    registerTool(
        'get_profile',
        {
            title: 'About Matthew Anderson',
            description:
                'Who Matthew Anderson (and3rn3t) is: current role, what Matthew builds, and where to find Matthew online and on this site.',
            outputSchema: OUTPUT.profile,
        },
        async () => {
            const { experience } = await loadExperience(env);
            const current = experience.find(job => job.current) ?? experience[0];
            return asData({
                name: 'Matthew Anderson',
                handle: 'and3rn3t',
                role: current ? `${current.role} at ${current.company}` : null,
                about: 'A software engineer who builds health tech, home automation and data tools in spare time, mostly in TypeScript, Swift and Python.',
                site: `${SITE_ORIGIN}/`,
                llms_txt: `${SITE_ORIGIN}/llms.txt`,
                github: 'https://github.com/and3rn3t',
                linkedin: 'https://linkedin.com/in/and3rn3t',
                email: 'and3rn3t@icloud.com',
            });
        }
    );

    registerTool(
        'list_projects',
        {
            title: 'List projects',
            description:
                'List the portfolio projects with a one-line description, category, status, technologies and links. Use get_project for the full write-up.',
            outputSchema: OUTPUT.projects,
            inputSchema: {
                category: z
                    .string()
                    .optional()
                    .describe('Only projects in this category, e.g. "Health & Wellness"'),
                technology: z
                    .string()
                    .optional()
                    .describe('Only projects that use this technology, e.g. "TypeScript"'),
            },
        },
        async ({ category, technology }) => {
            const projects = await loadProjects(env);
            const matches = projects.filter(({ view }) => {
                const inCategory =
                    !category || (view.category ?? '').toLowerCase() === category.toLowerCase();
                const usesTech =
                    !technology ||
                    [view.language, ...view.technologies].some(
                        tech => tech.toLowerCase() === technology.toLowerCase()
                    );
                return inCategory && usesTech;
            });
            return asData({ projects: matches.map(summarise) });
        }
    );

    registerTool(
        'get_project',
        {
            title: 'Get a project',
            description:
                'The full write-up of one project: overview, highlights, technologies, metrics where there are any, and links to the page, the source and a live demo.',
            outputSchema: OUTPUT.project,
            inputSchema: {
                name: z
                    .string()
                    .describe('The project name or page slug, e.g. "health" or "homehub"'),
            },
        },
        async ({ name }) => {
            const projects = await loadProjects(env);
            const found = findProject(projects, name);
            if (!found) {
                const known = projects.map(({ metadata }) => metadata.name).join(', ');
                return asNotFound(`No project called "${name}". Projects: ${known}.`);
            }
            return asData(projectDetail(found));
        }
    );

    // An MCP App (roadmap 13.10): the same data as get_project, drawn as a card inside Claude.
    registerAppTool(
        { registerTool },
        'show_project',
        {
            title: 'Show a project card',
            description:
                'Show one project as a card (title, description, technologies, links) in clients that can display MCP Apps. Same data as get_project. Where the client displays the card, the user already sees it, so do not repeat its contents there; add at most one sentence. Where it does not, answer from the data.',
            outputSchema: OUTPUT.project,
            inputSchema: {
                name: z.string().describe('The project name or page slug, e.g. "health"'),
            },
            _meta: { ui: { resourceUri: PROJECT_VIEW_URI } },
        },
        async ({ name }) => {
            const found = findProject(await loadProjects(env), name);
            if (!found) return asNotFound(`No project called "${name}".`);
            return asData(projectDetail(found));
        }
    );
    registerAppResource(
        server,
        'Project card',
        PROJECT_VIEW_URI,
        {
            description: 'A project as a card: title, description, technologies and links.',
            _meta: {
                ui: {
                    csp: { resourceDomains: ['https://cdn.jsdelivr.net'] },
                    domain: PROJECT_VIEW_DOMAIN,
                    prefersBorder: true,
                },
            },
        },
        async () => ({
            contents: [
                {
                    uri: PROJECT_VIEW_URI,
                    mimeType: RESOURCE_MIME_TYPE,
                    text: PROJECT_VIEW_HTML,
                },
            ],
        })
    );

    registerTool(
        'list_experience',
        {
            title: 'Work history and education',
            description:
                "Matthew Anderson's work history and education, newest first, with what each role involved.",
            outputSchema: OUTPUT.experience,
        },
        async () => {
            const { experience, education } = await loadExperience(env);
            return asData({
                experience: experience.map(job => ({
                    role: job.role,
                    company: job.company,
                    from: job.startDate,
                    to: job.current ? 'present' : job.endDate,
                    summary: job.summary,
                    highlights: job.highlights,
                    technologies: job.technologies,
                })),
                education: education.map(school => ({
                    degree: school.degree,
                    institution: school.institution,
                    from: school.startDate,
                    to: school.endDate,
                    highlights: school.highlights,
                })),
            });
        }
    );

    registerTool(
        'list_posts',
        {
            title: 'List posts',
            description:
                'The technical posts on the site, newest first, with date, summary and tags. Use get_post to read one.',
            outputSchema: OUTPUT.posts,
            inputSchema: {
                tag: z
                    .string()
                    .optional()
                    .describe('Only posts with this tag, e.g. "Cloudflare Workers"'),
            },
        },
        async ({ tag }) => {
            const posts = await loadPosts(env);
            const matches = tag
                ? posts.filter(post =>
                      (post.tags ?? []).some(t => t.toLowerCase() === tag.toLowerCase())
                  )
                : posts;
            return asData({
                posts: matches.map(post => ({
                    slug: post.slug,
                    title: post.title,
                    date: post.date,
                    summary: post.summary,
                    tags: post.tags ?? [],
                    reading_minutes: post.readingMinutes ?? null,
                    url: `${SITE_ORIGIN}/posts/${post.slug}/`,
                })),
            });
        }
    );

    registerTool(
        'get_post',
        {
            title: 'Read a post',
            description:
                'The full text of one post, as plain text with its headings and lists kept.',
            outputSchema: OUTPUT.post,
            inputSchema: {
                slug: z.string().describe('The post slug from list_posts'),
            },
        },
        async ({ slug }) => {
            const posts = await loadPosts(env);
            const post = posts.find(candidate => candidate.slug === slug.trim().toLowerCase());
            if (!post) {
                return asNotFound(
                    `No post with the slug "${slug}". Slugs: ${posts.map(p => p.slug).join(', ')}.`
                );
            }
            return asData({
                slug: post.slug,
                title: post.title,
                date: post.date,
                tags: post.tags ?? [],
                url: `${SITE_ORIGIN}/posts/${post.slug}/`,
                text: htmlToText(post.content),
            });
        }
    );

    registerTool(
        'get_recent_activity',
        {
            title: 'Recent GitHub activity',
            annotations: { openWorldHint: true },
            outputSchema: OUTPUT.activity,
            description:
                "Matthew Anderson's most recent public GitHub activity (a push, pull request, release or new repository), refreshed every five minutes.",
        },
        async () => {
            const result = await deps.getActivity();
            if (!result.ok) return asError(`Recent activity is not available (${result.error}).`);
            return asData(result.activity);
        }
    );

    registerTool(
        'get_site_stats',
        {
            title: 'Site health and traffic',
            description:
                'How andernet.dev and its API are doing: API latency and error rate, uptime history, MCP tool use, real-visitor Web Vitals and verified crawler traffic, cached for five minutes. Aggregates only; any section can be null when there is nothing to report.',
            outputSchema: OUTPUT.stats,
        },
        async () => {
            const result = await deps.getStats();
            if (!result.ok) return asError(`Site stats are not available (${result.error}).`);
            return asData(result.stats);
        }
    );

    // An MCP App too (roadmap 14.3): the same data as get_site_stats, drawn as a panel in Claude.
    registerAppTool(
        { registerTool },
        'show_status',
        {
            title: 'Show the site status panel',
            description:
                'Show how andernet.dev and its API are doing (uptime, latency, Web Vitals, MCP tool use) as a panel in clients that can display MCP Apps. Same data as get_site_stats. Where the client displays the panel, the user already sees it, so do not repeat its numbers there; add at most one sentence. Where it does not, answer from the data.',
            outputSchema: OUTPUT.stats,
            _meta: { ui: { resourceUri: STATUS_VIEW_URI } },
        },
        async () => {
            const result = await deps.getStats();
            if (!result.ok) return asError(`Site stats are not available (${result.error}).`);
            return asData(result.stats);
        }
    );
    registerAppResource(
        server,
        'Status panel',
        STATUS_VIEW_URI,
        {
            description:
                'How the site and its API are doing: uptime, latency, Web Vitals and MCP tool use.',
            _meta: {
                ui: {
                    csp: { resourceDomains: ['https://cdn.jsdelivr.net'] },
                    domain: PROJECT_VIEW_DOMAIN,
                    prefersBorder: true,
                },
            },
        },
        async () => ({
            contents: [
                { uri: STATUS_VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: STATUS_VIEW_HTML },
            ],
        })
    );

    return server;
}

/**
 * Answer one MCP request. A new handler per request, because the tools need this request's
 * bindings and the server keeps no state between requests.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} ctx
 * @param {object} deps - see createServer
 * @returns {Promise<Response>}
 */
export function handleMcp(request, env, ctx, deps) {
    return createMcpHandler(() => createServer(env, deps))(request, env, ctx);
}
