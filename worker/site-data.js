/**
 * The portfolio's own content, as the MCP tools read it.
 *
 * The data is not bundled into the Worker: it is fetched from the files the site publishes
 * (projects-data.json, posts-data.json, experience-data.json), so an edit to the content shows
 * up here after the next Pages deploy without a Worker deploy. Cloudflare caches each file for
 * five minutes at the edge.
 *
 * Workers-compatible: standard fetch only.
 */

import { projectView } from '../modules/utils/projects.js';

export const SITE_ORIGIN = 'https://andernet.dev';
const CACHE_SECONDS = 300;

/**
 * @param {string} path - a published file, e.g. "/posts-data.json"
 * @param {{ SITE_ORIGIN?: string } | undefined} env - SITE_ORIGIN lets a test or a preview point elsewhere
 * @returns {Promise<any>} the parsed JSON
 */
export async function loadJson(path, env) {
    const origin = env?.SITE_ORIGIN ?? SITE_ORIGIN;
    const response = await fetch(`${origin}${path}`, {
        cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
}

/** @returns {Promise<{ experience: object[], education: object[] }>} */
export const loadExperience = env => loadJson('/experience-data.json', env);

/** @returns {Promise<object[]>} the posts, newest first */
export async function loadPosts(env) {
    const { posts } = await loadJson('/posts-data.json', env);
    return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Every curated project, in the order the data file lists them, in the shape the pages use.
 * @returns {Promise<{ metadata: object, view: ReturnType<typeof projectView> }[]>}
 */
export async function loadProjects(env) {
    const { projects } = await loadJson('/projects-data.json', env);
    return projects.map(metadata => ({ metadata, view: projectView(null, metadata) }));
}

/** The address of a project's page on the site, or its GitHub repository when it has no page. */
export function projectUrl(view) {
    return view.pageUrl ? `${SITE_ORIGIN}${view.pageUrl}` : view.htmlUrl;
}

/**
 * Remove every tag. One pass is not enough: stripping "<b>" from "<scr<b>ipt>" can leave a
 * new tag behind, so repeat until nothing changes.
 */
function stripTags(html) {
    let previous;
    let text = html;
    do {
        previous = text;
        text = text.replaceAll(/<[^>]+>/g, '');
    } while (text !== previous);
    return text;
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/**
 * A post's HTML as plain text with the structure kept: blank lines between blocks, "- " for
 * list items, "## " for headings, fences for code. Not a general converter: it only has to
 * read what scripts/templates produce from posts-data.json.
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
    const structured = html
        .replaceAll(
            /<pre[^>]*>([\s\S]*?)<\/pre>/g,
            (_match, code) => `\n\n\`\`\`\n${code}\n\`\`\`\n\n`
        )
        .replaceAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g, '\n\n## $1\n\n')
        .replaceAll(/<li[^>]*>/g, '\n- ')
        .replaceAll(/<\/(p|ul|ol|blockquote|div|table)>/g, '\n\n')
        .replaceAll(/<br\s*\/?>/g, '\n')
        // Either quote style: the posts' own anchors use single quotes
        .replaceAll(/<a\s[^>]*?href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/g, '$3 ($2)');
    // Tags first, entities after: "&lt;b&gt;" in a post is text about a tag, and stays text
    return stripTags(structured)
        .replaceAll(/&(amp|lt|gt|quot|#39);/g, entity => ENTITIES[entity])
        .replaceAll(/[ \t]+\n/g, '\n')
        .replaceAll(/\n{3,}/g, '\n\n')
        .trim();
}
