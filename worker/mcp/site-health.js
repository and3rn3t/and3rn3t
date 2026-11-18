/**
 * The tools that report on the live site: the latest GitHub activity, the site's health and
 * traffic, and the status panel (an MCP App, roadmap 14.3) that draws the same data inside Claude.
 * The numbers come from the Worker through `deps`, so they are the ones /status/ shows.
 *
 * Workers-compatible: no Node built-ins.
 */

import {
    RESOURCE_MIME_TYPE,
    registerAppResource,
    registerAppTool,
} from '@modelcontextprotocol/ext-apps/server';
import { STATUS_VIEW_HTML } from '../mcp-app-status.js';
import { OUTPUT, appResourceMeta, asData, asError } from './shared.js';

const STATUS_VIEW_URI = 'ui://portfolio/status.html';

/**
 * @param {{ server: object, deps: object, registerTool: Function }} context
 */
export function registerSiteHealth({ server, deps, registerTool }) {
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
            _meta: appResourceMeta(),
        },
        async () => ({
            contents: [
                { uri: STATUS_VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: STATUS_VIEW_HTML },
            ],
        })
    );
}
