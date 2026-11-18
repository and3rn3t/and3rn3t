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
import { SITE_ORIGIN } from './site-data.js';
import { registerPromptsAndResources } from './mcp/prompts-resources.js';
import { registerExperience, registerProfile } from './mcp/profile.js';
import { registerPosts } from './mcp/posts.js';
import { registerProjects } from './mcp/projects.js';
import { makeRegisterTool } from './mcp/shared.js';
import { registerSiteHealth } from './mcp/site-health.js';

const SERVER_NAME = 'andernet-portfolio';
// Bump it (minor) whenever a tool is added, removed or changes its schema: clients can keep a server's
// tool list until its version changes, and a new tool at the same version may never reach them
// (tests/worker/mcp.test.js pins the two together).
export const SERVER_VERSION = '1.3.0';
// The mark a client shows beside the server's name: the green "agent" tile that
// scripts/brand-mark.mjs draws (`pnpm build:brand`). PNG first, since SVG support is optional.
export const SERVER_ICONS = [
    { src: `${SITE_ORIGIN}/icons/agent-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
    { src: `${SITE_ORIGIN}/icons/agent.svg`, mimeType: 'image/svg+xml', sizes: ['any'] },
];

/**
 * @param {object} env - the Worker's bindings (SITE_ORIGIN overrides where content is read)
 * @param {{ getActivity: () => Promise<{ ok: boolean, activity?: object, error?: string }>, getStats: () => Promise<{ ok: boolean, stats?: object, error?: string }> }} deps
 */
export function createServer(env, deps) {
    const server = new McpServer({
        name: SERVER_NAME,
        title: "Matthew Anderson's portfolio",
        version: SERVER_VERSION,
        websiteUrl: `${SITE_ORIGIN}/`,
        icons: SERVER_ICONS,
    });

    // Every tool goes through registerTool (mcp/shared.js), so each call is timed and recorded once.
    // The groups register in the order tools/list has always shown them.
    const context = { server, env, deps, registerTool: makeRegisterTool(server, env) };
    registerProfile(context);
    registerProjects(context);
    registerExperience(context);
    registerPosts(context);
    registerSiteHealth(context);
    registerPromptsAndResources(server, env);

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
