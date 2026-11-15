/**
 * Agent view (lab experiment `agent-view`): a button on every page that opens what a crawler or
 * an AI agent gets here, so the machine-readable side of the site can be seen by anyone.
 *
 *   - this page's Markdown: the same URL fetched with `Accept: text/markdown`, which Cloudflare
 *     answers with a converted copy and a token estimate (the local server does not, and says so)
 *   - the tools on the site's MCP server (`tools/list` on /mcp)
 *   - the documents agents start from
 *
 * Everything is shown with textContent. Nothing is sent but two reads of this site's own URLs, and
 * only when the visitor opens the dialog. The first half of this file is pure so tests can run it.
 */

/** The MCP server is a Worker route, not a file (check:refs only follows literal fetch paths). */
const MCP_PATH = '/mcp';

/** Longest stretch of Markdown shown; the full text is one click away on the page's own URL. */
export const PREVIEW_CHARS = 4000;

export const ENTRY_POINTS = [
    {
        href: '/llms.txt',
        label: 'llms.txt',
        note: 'the site as a list of links for language models',
    },
    {
        href: '/.well-known/mcp/server-card.json',
        label: 'MCP server card',
        note: 'what the MCP server is and where it lives',
    },
    {
        href: '/.well-known/api-catalog',
        label: 'API catalog',
        note: 'the site’s APIs, as a linkset',
    },
    { href: '/api/openapi.json', label: 'OpenAPI', note: 'the small HTTP API' },
    { href: '/feed.xml', label: 'RSS feed', note: 'the posts, in full' },
];

/**
 * What the Markdown request came back as, in words.
 * @param {{ ok: boolean, status: number, contentType: string, tokens: string | null, text: string }} reply
 * @returns {{ kind: 'markdown' | 'html' | 'error', summary: string, preview: string }}
 */
export function describeMarkdownReply({ ok, status, contentType, tokens, text }) {
    if (!ok) {
        return { kind: 'error', summary: `The request failed (${status}).`, preview: '' };
    }
    if (!/text\/markdown/i.test(contentType)) {
        return {
            kind: 'html',
            summary:
                'This server sent HTML back, not Markdown. Cloudflare converts pages to Markdown at the edge, so this appears on andernet.dev itself, not on a local copy.',
            preview: '',
        };
    }
    const parts = [`${text.length.toLocaleString('en-US')} characters of Markdown`];
    if (tokens && Number.isFinite(Number(tokens))) {
        parts.push(`about ${Number(tokens).toLocaleString('en-US')} tokens`);
    }
    const preview =
        text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS).trimEnd()}\n…` : text;
    return { kind: 'markdown', summary: `${parts.join(', ')}.`, preview };
}

/**
 * The tools out of an MCP `tools/list` reply, which is Server-Sent Events (`data:` lines) or plain JSON.
 * @param {string} body
 * @returns {{ name: string, title: string }[]}
 */
export function parseToolList(body) {
    const dataLine = body.split('\n').find(line => line.startsWith('data:'));
    try {
        const message = JSON.parse(dataLine ? dataLine.slice(5) : body);
        const tools = message?.result?.tools;
        if (!Array.isArray(tools)) {
            return [];
        }
        return tools
            .filter(tool => typeof tool?.name === 'string')
            .map(tool => ({
                name: tool.name,
                title: String(tool.title ?? tool.annotations?.title ?? ''),
            }));
    } catch {
        return [];
    }
}

// ── The dialog ───────────────────────────────────────────────────────────────

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== undefined) {
        node.textContent = text;
    }
    return node;
}

async function loadMarkdown() {
    // no-store: the browser's own cache must not keep this under the page's address
    const response = await fetch(location.pathname, {
        headers: { Accept: 'text/markdown' },
        cache: 'no-store',
    });
    return describeMarkdownReply({
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') ?? '',
        tokens: response.headers.get('x-markdown-tokens'),
        text: await response.text(),
    });
}

async function loadTools() {
    const response = await fetch(MCP_PATH, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        cache: 'no-store',
    });
    return response.ok ? parseToolList(await response.text()) : [];
}

function buildDialog() {
    const dialog = element('dialog', 'agent-view');
    dialog.setAttribute('aria-labelledby', 'agent-view-title');

    const head = element('div', 'agent-view__head');
    head.append(element('h2', 'agent-view__title', 'What an agent gets here'));
    head.lastChild.id = 'agent-view-title';
    const close = element('button', 'agent-view__close', 'Close');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    head.append(close);

    const intro = element(
        'p',
        'agent-view__note',
        'The same address, asked for the way a crawler or an AI agent asks. Nothing here is sent anywhere but this site.'
    );

    const pageHeading = element('h3', 'agent-view__heading', 'This page as Markdown');
    const pageSummary = element('p', 'agent-view__note', 'Loading…');
    const pagePreview = element('pre', 'agent-view__pre');
    pagePreview.tabIndex = 0;
    pagePreview.hidden = true;

    const toolsHeading = element('h3', 'agent-view__heading', 'Tools on the MCP server');
    const toolsNote = element('p', 'agent-view__note', 'Loading…');
    const toolsList = element('ul', 'agent-view__list');

    const startHeading = element('h3', 'agent-view__heading', 'Where agents start');
    const startList = element('ul', 'agent-view__list');
    for (const entry of ENTRY_POINTS) {
        const item = element('li');
        const link = element('a', 'link', entry.label);
        link.href = entry.href;
        item.append(link, element('span', 'agent-view__muted', ` — ${entry.note}`));
        startList.append(item);
    }

    dialog.append(
        head,
        intro,
        pageHeading,
        pageSummary,
        pagePreview,
        toolsHeading,
        toolsNote,
        toolsList,
        startHeading,
        startList
    );
    dialog.addEventListener('click', event => {
        if (event.target === dialog) {
            dialog.close();
        }
    });

    let loaded = false;
    async function load() {
        if (loaded) {
            return;
        }
        loaded = true;
        const [markdown, tools] = await Promise.allSettled([loadMarkdown(), loadTools()]);
        if (markdown.status === 'fulfilled') {
            pageSummary.textContent = markdown.value.summary;
            pagePreview.textContent = markdown.value.preview;
            pagePreview.hidden = markdown.value.kind !== 'markdown';
        } else {
            pageSummary.textContent = 'The request could not be made.';
        }
        const list = tools.status === 'fulfilled' ? tools.value : [];
        toolsNote.textContent = list.length
            ? `${list.length} tools, all read-only. An agent can call them without signing in.`
            : 'The MCP server did not answer here. It is served at andernet.dev/mcp, so this shows on the live site.';
        for (const tool of list) {
            const item = element('li');
            item.append(
                element('code', '', tool.name),
                element('span', 'agent-view__muted', tool.title ? ` — ${tool.title}` : '')
            );
            toolsList.append(item);
        }
    }

    return { dialog, load };
}

/** Add the button, and the dialog it opens. Safe to call more than once. */
export function initAgentView() {
    if (document.querySelector('.agent-view-button')) {
        return;
    }
    const link = element('link');
    link.rel = 'stylesheet';
    link.href = '/styles/agent-view.css';
    document.head.append(link);

    const { dialog, load } = buildDialog();
    const button = element('button', 'agent-view-button', 'Agent view');
    button.type = 'button';
    button.addEventListener('click', () => {
        dialog.showModal();
        load();
    });
    document.body.append(button, dialog);
}
