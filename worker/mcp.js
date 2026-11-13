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
    SITE_ORIGIN,
    htmlToText,
    loadExperience,
    loadPosts,
    loadProjects,
    projectUrl,
} from './site-data.js';
import { recordTool } from './telemetry.js';

const SERVER_NAME = 'andernet-portfolio';
export const SERVER_VERSION = '1.0.0';

const asText = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const asError = text => ({ isError: true, content: [{ type: 'text', text }] });

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
                    ok = !result?.isError;
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
                'Who Matthew Anderson (and3rn3t) is: current role, what he builds, and where to find him online and on this site.',
        },
        async () => {
            const { experience } = await loadExperience(env);
            const current = experience.find(job => job.current) ?? experience[0];
            return asText({
                name: 'Matthew Anderson',
                handle: 'and3rn3t',
                role: current ? `${current.role} at ${current.company}` : null,
                about: 'A software engineer who builds health tech, home automation and data tools in his own time, mostly in TypeScript, Swift and Python.',
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
            return asText(matches.map(summarise));
        }
    );

    registerTool(
        'get_project',
        {
            title: 'Get a project',
            description:
                'The full write-up of one project: overview, highlights, technologies, metrics where there are any, and links to the page, the source and a live demo.',
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
                return asError(`No project called "${name}". Projects: ${known}.`);
            }
            const { view } = found;
            return asText({
                ...summarise(found),
                overview: view.longDescription ?? view.description,
                highlights: view.highlights,
                metrics: view.metrics,
                live_demo: view.homepage ?? null,
            });
        }
    );

    registerTool(
        'list_experience',
        {
            title: 'Work history and education',
            description:
                "Matthew Anderson's work history and education, newest first, with what each role involved.",
        },
        async () => {
            const { experience, education } = await loadExperience(env);
            return asText({
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
            return asText(
                matches.map(post => ({
                    slug: post.slug,
                    title: post.title,
                    date: post.date,
                    summary: post.summary,
                    tags: post.tags ?? [],
                    reading_minutes: post.readingMinutes ?? null,
                    url: `${SITE_ORIGIN}/posts/${post.slug}/`,
                }))
            );
        }
    );

    registerTool(
        'get_post',
        {
            title: 'Read a post',
            description:
                'The full text of one post, as plain text with its headings and lists kept.',
            inputSchema: {
                slug: z.string().describe('The post slug from list_posts'),
            },
        },
        async ({ slug }) => {
            const posts = await loadPosts(env);
            const post = posts.find(candidate => candidate.slug === slug.trim().toLowerCase());
            if (!post) {
                return asError(
                    `No post with the slug "${slug}". Slugs: ${posts.map(p => p.slug).join(', ')}.`
                );
            }
            return asText({
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
            description:
                "Matthew Anderson's most recent public GitHub activity (a push, pull request, release or new repository), cached for five minutes.",
        },
        async () => {
            const result = await deps.getActivity();
            if (!result.ok) return asError(`Recent activity is not available (${result.error}).`);
            return asText(result.activity);
        }
    );

    registerTool(
        'get_site_stats',
        {
            title: 'Site health and traffic',
            description:
                'How andernet.dev and its API are doing: API latency and error rate, uptime history, MCP tool use, real-visitor Web Vitals and verified crawler traffic, cached for five minutes. Aggregates only; any section can be null when there is nothing to report.',
        },
        async () => {
            const result = await deps.getStats();
            if (!result.ok) return asError(`Site stats are not available (${result.error}).`);
            return asText(result.stats);
        }
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
