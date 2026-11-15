/**
 * What the MCP server offers besides tools: prompts (starting points a person picks in their
 * client) and resources (a post or a project as Markdown, to attach to a conversation).
 *
 * Pure: no bindings and no fetching, so tests can run it directly. worker/mcp.js registers it.
 * Copy rule (pnpm check:copy): nothing here refers to Matthew with a gendered pronoun.
 */

import { z } from 'zod';
import { SITE_ORIGIN, htmlToText } from './site-data.js';

export const RESOURCE_SCHEME = 'portfolio://';
export const MARKDOWN = 'text/markdown';

/** The URI of a post or a project as a resource. */
export const postUri = slug => `${RESOURCE_SCHEME}posts/${slug}`;
export const projectUri = name => `${RESOURCE_SCHEME}projects/${name}`;

/**
 * Prompts. Each tells the model which tools to use and what to leave unsaid; the arguments are
 * text the person typed, so each has a length limit and is only ever quoted, never obeyed as
 * instructions (the model reads it as the role or project to talk about).
 */
export const PROMPTS = [
    {
        name: 'brief-for-role',
        title: 'Brief for a role',
        description:
            'A short, evidence-based brief on whether Matthew Anderson fits a role you describe, built from the portfolio tools.',
        args: {
            role: z
                .string()
                .min(2)
                .max(200)
                .describe('The role, e.g. "senior iOS engineer on a health app"'),
        },
        text: ({ role }) =>
            `Write a short brief on whether Matthew Anderson (${SITE_ORIGIN}) fits this role, quoted exactly: "${role}".\n\n` +
            'Use the portfolio tools, not memory: get_profile, list_experience and list_projects, then get_project for the projects that look most relevant. ' +
            'Choose at most three projects. For each, say what it shows that the role needs and link its page. ' +
            'Then say plainly what the role asks for that the portfolio does not show. ' +
            'State nothing the tools did not return.',
    },
    {
        name: 'compare-projects',
        title: 'Compare two projects',
        description:
            'Compare two of the projects on the site: what each does, the technologies, the scope and the status.',
        args: {
            first: z.string().min(1).max(100).describe('A project name from list_projects'),
            second: z.string().min(1).max(100).describe('Another project name'),
        },
        text: ({ first, second }) =>
            `Compare two projects from ${SITE_ORIGIN}, named exactly: "${first}" and "${second}".\n\n` +
            'Call get_project for each (use list_projects if a name is not found). ' +
            'Compare what each does, the technologies, how far along it is, and what it shows about how it was built. ' +
            'Finish with one sentence on when each is the better example to look at. ' +
            'State nothing the tools did not return.',
    },
    {
        name: 'recent-work',
        title: 'What is new',
        description: 'What Matthew Anderson has published or pushed recently.',
        args: {},
        text: () =>
            `Summarise what is new at ${SITE_ORIGIN}.\n\n` +
            'Call get_recent_activity for the latest public GitHub activity and list_posts for the newest posts. ' +
            'Report the newest post and the latest activity with their dates and links, in a few sentences. ' +
            'State nothing the tools did not return.',
    },
];

/**
 * A post as one Markdown document.
 * @param {{ slug: string, title: string, date: string, tags?: string[], content: string }} post
 * @returns {string}
 */
export function postMarkdown(post) {
    const tags = (post.tags ?? []).length ? `Tags: ${post.tags.join(', ')}\n` : '';
    return (
        `# ${post.title}\n\nPublished ${post.date}. ${SITE_ORIGIN}/posts/${post.slug}/\n${tags}\n` +
        `${htmlToText(post.content)}\n`
    );
}

/**
 * A project as one Markdown document, from the same data get_project returns.
 * @param {{ name: string, title: string, overview?: string | null, description?: string | null,
 *   category?: string | null, status?: string | null, technologies: string[], highlights?: string[] | null,
 *   metrics?: { value: string, label: string }[] | null, url?: string | null, source?: string | null,
 *   live_demo?: string | null }} project
 * @returns {string}
 */
export function projectMarkdown(project) {
    const facts = [
        project.category && `Category: ${project.category}`,
        project.status && `Status: ${project.status}`,
        project.technologies?.length && `Technologies: ${project.technologies.join(', ')}`,
    ].filter(Boolean);
    const links = [
        project.url && `- Page: ${project.url}`,
        project.source && `- Source: ${project.source}`,
        project.live_demo && `- Live demo: ${project.live_demo}`,
    ].filter(Boolean);
    const sections = [
        `# ${project.title}`,
        project.overview ?? project.description ?? '',
        facts.join('\n'),
        project.highlights?.length
            ? `## Highlights\n\n${project.highlights.map(item => `- ${item}`).join('\n')}`
            : '',
        project.metrics?.length
            ? `## Numbers\n\n${project.metrics.map(m => `- ${m.value} ${m.label}`).join('\n')}`
            : '',
        links.length ? `## Links\n\n${links.join('\n')}` : '',
    ];
    return `${sections.filter(Boolean).join('\n\n')}\n`;
}
