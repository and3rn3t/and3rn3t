/**
 * The project tools, and the project card (an MCP App, roadmap 13.10) that draws the same data
 * inside Claude.
 *
 * Workers-compatible: no Node built-ins.
 */

import {
    RESOURCE_MIME_TYPE,
    registerAppResource,
    registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { loadProjects } from '../site-data.js';
import { PROJECT_VIEW_HTML } from '../mcp-app-view.js';
import {
    OUTPUT,
    appResourceMeta,
    asData,
    asNotFound,
    findProject,
    projectDetail,
    summarise,
} from './shared.js';

const PROJECT_VIEW_URI = 'ui://portfolio/project.html';

/** @param {{ server: object, env: object, registerTool: Function }} context */
export function registerProjects({ server, env, registerTool }) {
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
            _meta: appResourceMeta(),
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
}
