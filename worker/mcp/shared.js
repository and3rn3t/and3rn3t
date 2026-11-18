/**
 * What the MCP tool groups share: the result shapes, the project lookup and summaries, the output
 * schemas advertised in tools/list, and the one way a tool is registered (annotated read-only,
 * and timed so /status/ can count it).
 *
 * Workers-compatible: no Node built-ins.
 */

import { z } from 'zod';
import { projectUrl } from '../site-data.js';
import { recordTool } from '../telemetry.js';

/**
 * A result for clients that read typed data (structuredContent, checked against the tool's
 * outputSchema) and for clients that only read text: the text is the same JSON.
 */
export const asData = data => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
});
export const asError = text => ({ isError: true, content: [{ type: 'text', text }] });

/**
 * "There is no such project or post" is an answer, not a failure of the tool: the model is told
 * (isError, so it retries with a listed name), but the call is recorded as a success, or a correct
 * answer would show on /status/ as an error (the weekly eval asks for a project that does not exist).
 */
const notFoundResults = new WeakSet();
export const asNotFound = text => {
    const result = asError(text);
    notFoundResults.add(result);
    return result;
};

/** The project matching a name, a page slug or a display name, ignoring case. */
export function findProject(projects, wanted) {
    const key = wanted.trim().toLowerCase();
    return projects.find(
        ({ metadata, view }) =>
            metadata.name.toLowerCase() === key ||
            view.pageSlug === key ||
            view.displayName.toLowerCase() === key
    );
}

// Claude derives an app's origin from the server URL: first 32 hex of sha256("https://andernet.dev/mcp").
const APP_DOMAIN = '71442e512ec275182b8e0b135be88382.claudemcpcontent.com';

/** The UI metadata both MCP Apps' resources carry (a fresh object each time). */
export const appResourceMeta = () => ({
    ui: {
        csp: { resourceDomains: ['https://cdn.jsdelivr.net'] },
        domain: APP_DOMAIN,
        prefersBorder: true,
    },
});

export const summarise = ({ metadata, view }) => ({
    name: metadata.name,
    title: view.displayName,
    description: view.description,
    category: view.category ?? null,
    status: view.status ?? null,
    technologies: view.technologies,
    url: projectUrl(view),
    source: view.htmlUrl,
});

export const projectDetail = found => ({
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
export const OUTPUT = {
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
 * Every tool only reads, so Claude can run them without asking each time. A tool that reaches
 * outside this site's own data sets openWorldHint in its own config.
 */
const READ_ONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};

/**
 * The registerTool every group uses, so each call is timed and recorded once (a tool that throws,
 * or returns isError, counts as an error, except a "not found" answer). Handlers get the SDK's
 * arguments as is.
 * @param {import('@modelcontextprotocol/server').McpServer} server
 * @param {object} env
 */
export function makeRegisterTool(server, env) {
    return (name, config, handler) =>
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
}
