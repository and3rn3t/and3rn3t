/**
 * WebMCP: the page's own actions, offered to an AI agent running in the visitor's browser
 * (https://webmachinelearning.github.io/webmcp/).
 *
 * Browsers that support it expose `document.modelContext`; for everyone else this module is
 * never even downloaded (main.js checks first). The tools only do what a visitor can do by hand,
 * and none of them sends anything: the contact tool drafts a message and leaves the Send button
 * to the person.
 *
 * @author Matthew Anderson
 */

import { debug } from './debug.js';
import { loadJSON } from './utils/data.js';
import { projectView } from './utils/projects.js';

const MAX_RESULTS = 8;

// The limits the contact form itself enforces (index.html), so a draft the form would refuse is
// refused here with a reason
export const FIELD_LIMITS = {
    name: { min: 2, max: 100 },
    email: { max: 254 },
    subject: { min: 3, max: 200 },
    message: { min: 10, max: 5000 },
};

/**
 * @param {Document} [doc]
 * @param {Navigator} [nav]
 * @returns {object | null} the browser's ModelContext: `document.modelContext`, or
 *   `navigator.modelContext` in builds that still put it there
 */
export function findModelContext(doc = globalThis.document, nav = globalThis.navigator) {
    return doc?.modelContext ?? nav?.modelContext ?? null;
}

/**
 * Projects, posts and sections matching every word of a query, best first. A match in a title
 * counts for more than one in a description.
 *
 * @param {string} query
 * @param {{ type: string, title: string, url: string, summary: string, keywords?: string }[]} items
 * @param {number} [limit]
 */
export function searchItems(query, items, limit = MAX_RESULTS) {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items
        .map(item => {
            const title = item.title.toLowerCase();
            const rest = `${item.summary} ${item.keywords ?? ''}`.toLowerCase();
            if (!words.every(word => title.includes(word) || rest.includes(word))) return null;
            const score = words.reduce(
                (sum, word) =>
                    sum + (title.includes(word) ? 3 : 1) + (title.startsWith(word) ? 2 : 0),
                0
            );
            return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
        .slice(0, limit)
        .map(({ item }) => ({
            type: item.type,
            title: item.title,
            url: item.url,
            summary: item.summary,
        }));
}

/** The projects as searchable and listable records. */
function projectItems(metadata) {
    return metadata.map(entry => {
        const view = projectView(null, entry);
        return {
            type: 'project',
            name: entry.name,
            title: view.displayName,
            url: view.pageUrl ?? view.htmlUrl,
            summary: view.description,
            category: view.category ?? null,
            technologies: [view.language, ...view.technologies],
            keywords: [view.category, ...view.technologies].filter(Boolean).join(' '),
        };
    });
}

/** The writing and the sections of the page, read from the page itself (as the palette does). */
function pageItems(doc) {
    const posts = [...doc.querySelectorAll('#blog-posts [data-slug]')].map(row => ({
        type: 'post',
        title: row.querySelector('a')?.textContent?.trim() || row.dataset.slug,
        url: `/posts/${encodeURIComponent(row.dataset.slug)}/`,
        summary: row.querySelector('time')?.textContent?.trim() ?? '',
        keywords: 'post writing blog article',
    }));
    const sections = [...doc.querySelectorAll('section[id]')].map(section => ({
        type: 'section',
        title: section.querySelector('.section-title, h1, h2')?.textContent?.trim() || section.id,
        url: `#${section.id}`,
        summary: `A section of this page (#${section.id})`,
    }));
    return [...posts, ...sections];
}

/** Set a form field the way typing would, so the form's own validation sees it. */
function fill(field, value) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
}

const text = (name, min, max) => ({
    type: 'string',
    minLength: min,
    maxLength: max,
    description: name,
});

/**
 * The tools. Everything the page offers goes through `deps`, so a test can pass fakes.
 *
 * @param {object} deps
 * @param {Document} deps.doc
 * @param {(path: string) => Promise<any>} deps.load - reads a published JSON file
 * @param {(url: string) => void} deps.navigate - go to a page of the site
 * @param {() => { isDark(): boolean, toggle(): void } | undefined} deps.theme - the theme manager, once it is up
 * @param {() => void} [deps.showMessageTab] - make the "Send a message" tab the visible one
 * @returns {object[]} WebMCP tool definitions
 */
export function createTools({ doc, load, navigate, theme, showMessageTab = () => {} }) {
    const projects = async () => {
        // loadJSON gives null, not an error, when the file cannot be had
        const data = await load('/projects-data.json');
        if (!data?.projects) throw new Error('The project list could not be loaded; try again.');
        return projectItems(data.projects);
    };

    return [
        {
            name: 'search_site',
            title: 'Search the portfolio',
            description:
                "Search Matthew Anderson's portfolio (projects, writing and page sections) for words. Every word must match. Returns up to 8 results with a title, address and summary.",
            inputSchema: {
                type: 'object',
                properties: {
                    query: { type: 'string', minLength: 1, description: 'Words to look for' },
                },
                required: ['query'],
            },
            annotations: { readOnlyHint: true },
            async execute({ query }) {
                if (typeof query !== 'string' || !query.trim()) throw new Error('Give a query.');
                const all = [...(await projects()), ...pageItems(doc)];
                const results = searchItems(query, all);
                return { query, count: results.length, results };
            },
        },
        {
            name: 'list_projects',
            title: 'List the projects',
            description:
                'The portfolio projects, with category, technologies and the address of each write-up. Optionally only one category or technology.',
            inputSchema: {
                type: 'object',
                properties: {
                    category: { type: 'string', description: 'e.g. "Health & Wellness"' },
                    technology: { type: 'string', description: 'e.g. "TypeScript"' },
                },
            },
            annotations: { readOnlyHint: true },
            async execute({ category, technology } = {}) {
                const matches = (await projects()).filter(
                    project =>
                        (!category || project.category?.toLowerCase() === category.toLowerCase()) &&
                        (!technology ||
                            project.technologies.some(
                                tech => tech.toLowerCase() === technology.toLowerCase()
                            ))
                );
                return matches.map(
                    ({ name, title, summary, category: cat, technologies, url }) => ({
                        name,
                        title,
                        summary,
                        category: cat,
                        technologies,
                        url,
                    })
                );
            },
        },
        {
            name: 'open_project',
            title: 'Open a project page',
            description:
                "Take the visitor to a project's write-up page. Use list_projects first to see the names.",
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'A project name from list_projects' },
                },
                required: ['name'],
            },
            async execute({ name }) {
                const wanted = String(name ?? '')
                    .trim()
                    .toLowerCase();
                const all = await projects();
                const found = all.find(
                    project =>
                        project.name.toLowerCase() === wanted ||
                        project.title.toLowerCase() === wanted
                );
                if (!found) {
                    throw new Error(
                        `No project called "${name}". Projects: ${all.map(p => p.name).join(', ')}.`
                    );
                }
                navigate(found.url);
                return { opened: found.title, url: found.url };
            },
        },
        {
            name: 'set_theme',
            title: 'Switch between light and dark',
            description: 'Set the page to the light or the dark theme.',
            inputSchema: {
                type: 'object',
                properties: { theme: { type: 'string', enum: ['light', 'dark'] } },
                required: ['theme'],
            },
            async execute({ theme: wanted }) {
                if (wanted !== 'light' && wanted !== 'dark') {
                    throw new Error('theme must be "light" or "dark".');
                }
                const manager = theme();
                if (!manager) throw new Error('The theme switch is not ready yet; try again.');
                if (manager.isDark() !== (wanted === 'dark')) manager.toggle();
                return { theme: wanted };
            },
        },
        {
            name: 'draft_contact_message',
            title: 'Draft a message to Matthew',
            description:
                'Fill in the contact form with a message for Matthew Anderson, and bring it into view. Nothing is sent: the visitor reads it and presses Send themselves. Only draft what the visitor asked you to say.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: text("The sender's name", FIELD_LIMITS.name.min, FIELD_LIMITS.name.max),
                    email: {
                        type: 'string',
                        format: 'email',
                        maxLength: FIELD_LIMITS.email.max,
                        description: "The sender's email address, for the reply",
                    },
                    subject: text('Subject', FIELD_LIMITS.subject.min, FIELD_LIMITS.subject.max),
                    message: text(
                        'The message',
                        FIELD_LIMITS.message.min,
                        FIELD_LIMITS.message.max
                    ),
                },
                required: ['name', 'email', 'subject', 'message'],
            },
            async execute(input = {}) {
                const form = doc.getElementById('contact-form');
                if (!form) throw new Error('The contact form is not on this page.');
                const values = Object.fromEntries(
                    Object.keys(FIELD_LIMITS).map(field => [
                        field,
                        String(input[field] ?? '').trim(),
                    ])
                );
                for (const [field, { min = 1, max }] of Object.entries(FIELD_LIMITS)) {
                    const { length } = values[field];
                    if (length < min || length > max) {
                        throw new Error(
                            `${field} must be ${min} to ${max} characters (got ${length}).`
                        );
                    }
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
                    throw new Error('email must be an email address.');
                }
                for (const [field, value] of Object.entries(values)) {
                    fill(form.elements[field], value);
                }
                showMessageTab();
                form.scrollIntoView?.({ block: 'center' });
                return {
                    drafted: true,
                    sent: false,
                    next: 'The visitor needs to read the message and press "Send message".',
                };
            },
        },
    ];
}

/**
 * Register the tools with the browser, and take them back when the page goes.
 *
 * @param {object} modelContext - from findModelContext
 * @param {object} deps - see createTools
 * @param {EventTarget} [lifetime] - gets "pagehide"
 * @returns {Promise<string[]>} the names of the tools that registered
 */
export async function registerWebMcp(modelContext, deps, lifetime = globalThis) {
    const controller = new AbortController();
    // pagehide also fires when the page enters the back/forward cache, and Back then restores this
    // same document without running main.js again: only a page that is really going takes them back
    const onPageHide = event => {
        if (event.persisted) return;
        controller.abort();
        lifetime.removeEventListener('pagehide', onPageHide);
    };
    lifetime.addEventListener('pagehide', onPageHide);
    const registered = [];
    for (const tool of createTools(deps)) {
        try {
            await modelContext.registerTool(tool, { signal: controller.signal });
            registered.push(tool.name);
        } catch (error) {
            // A name already taken, or a browser that refuses: the rest are still worth offering
            debug.warn(`[WebMCP] ${tool.name} not registered:`, error);
        }
    }
    return registered;
}

/**
 * Bring the message tab forward, so a drafted message is not left in a hidden panel behind the
 * guestbook tab. Before the tabs have started, a pending `#guestbook` link would select the
 * guestbook when they do, so that link is dropped.
 *
 * @param {{ doc: Document, tabs?: { select(tab: Element): void }, win?: Window }} context
 */
export function revealMessageTab({ doc, tabs, win = globalThis }) {
    const tab = doc.getElementById('contact-tab-message');
    if (!tab) return;
    if (tabs) {
        tabs.select(tab);
        return;
    }
    if (win.location.hash === '#guestbook') {
        win.history.replaceState(null, '', win.location.pathname + win.location.search);
    }
}

/** The real dependencies: this page, its published data, and the app's theme manager. */
export function pageDeps() {
    return {
        doc: document,
        load: loadJSON,
        navigate: url => globalThis.location.assign(url),
        theme: () => globalThis.appState?.managers?.theme,
        showMessageTab: () =>
            revealMessageTab({ doc: document, tabs: globalThis.appState?.managers?.contactTabs }),
    };
}
