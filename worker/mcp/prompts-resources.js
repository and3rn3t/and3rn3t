/**
 * Prompts and resources: see registerPromptsAndResources.
 *
 * Workers-compatible: no Node built-ins.
 */

import { ResourceTemplate } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { loadPosts, loadProjects } from '../site-data.js';
import {
    MARKDOWN,
    PROMPTS,
    postMarkdown,
    postUri,
    projectMarkdown,
    projectUri,
} from '../mcp-content.js';
import { findProject, projectDetail } from './shared.js';

/**
 * Prompts (starting points a person picks in their client) and resources (a post or a project as
 * Markdown to attach to a conversation). Read-only like the tools. They are not timed on /status/:
 * that page counts tool calls, and its layout (worker/telemetry.js) is fixed.
 */
export function registerPromptsAndResources(server, env) {
    for (const prompt of PROMPTS) {
        server.registerPrompt(
            prompt.name,
            {
                title: prompt.title,
                description: prompt.description,
                ...(Object.keys(prompt.args).length ? { argsSchema: z.object(prompt.args) } : {}),
            },
            args => ({
                messages: [
                    { role: 'user', content: { type: 'text', text: prompt.text(args ?? {}) } },
                ],
            })
        );
    }

    // The variable of a template can arrive as a list; the first is the one asked for
    const first = value => (Array.isArray(value) ? value[0] : value);

    server.registerResource(
        'post',
        new ResourceTemplate(`${postUri('{slug}')}`, {
            list: async () => ({
                resources: (await loadPosts(env)).map(post => ({
                    uri: postUri(post.slug),
                    name: post.slug,
                    title: post.title,
                    description: post.summary,
                    mimeType: MARKDOWN,
                })),
            }),
            complete: {
                slug: async value =>
                    (await loadPosts(env))
                        .map(post => post.slug)
                        .filter(slug => slug.startsWith(value)),
            },
        }),
        {
            title: 'A post',
            description: 'The full text of one post as Markdown. Slugs are listed by list_posts.',
            mimeType: MARKDOWN,
        },
        async (uri, variables) => {
            const slug = String(first(variables.slug) ?? '').toLowerCase();
            const post = (await loadPosts(env)).find(candidate => candidate.slug === slug);
            if (!post) throw new Error(`No post with the slug "${slug}".`);
            return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text: postMarkdown(post) }] };
        }
    );

    server.registerResource(
        'project',
        new ResourceTemplate(`${projectUri('{name}')}`, {
            list: async () => ({
                resources: (await loadProjects(env)).map(({ metadata, view }) => ({
                    uri: projectUri(metadata.name),
                    name: metadata.name,
                    title: view.displayName,
                    description: view.description,
                    mimeType: MARKDOWN,
                })),
            }),
            complete: {
                name: async value =>
                    (await loadProjects(env))
                        .map(({ metadata }) => metadata.name)
                        .filter(name => name.startsWith(value)),
            },
        }),
        {
            title: 'A project',
            description:
                'The write-up of one project as Markdown. Names are listed by list_projects.',
            mimeType: MARKDOWN,
        },
        async (uri, variables) => {
            const name = String(first(variables.name) ?? '');
            const found = findProject(await loadProjects(env), name);
            if (!found) throw new Error(`No project called "${name}".`);
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: MARKDOWN,
                        text: projectMarkdown(projectDetail(found)),
                    },
                ],
            };
        }
    );
}
