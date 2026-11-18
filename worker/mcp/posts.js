/**
 * The post tools: the list, and one post as plain text.
 *
 * Workers-compatible: no Node built-ins.
 */

import { z } from 'zod';
import { SITE_ORIGIN, htmlToText, loadPosts } from '../site-data.js';
import { OUTPUT, asData, asNotFound } from './shared.js';

/** @param {{ env: object, registerTool: Function }} context */
export function registerPosts({ env, registerTool }) {
    registerTool(
        'list_posts',
        {
            title: 'List posts',
            description:
                'The technical posts on the site, newest first, with date, summary and tags. Use get_post to read one.',
            outputSchema: OUTPUT.posts,
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
            return asData({
                posts: matches.map(post => ({
                    slug: post.slug,
                    title: post.title,
                    date: post.date,
                    summary: post.summary,
                    tags: post.tags ?? [],
                    reading_minutes: post.readingMinutes ?? null,
                    url: `${SITE_ORIGIN}/posts/${post.slug}/`,
                })),
            });
        }
    );

    registerTool(
        'get_post',
        {
            title: 'Read a post',
            description:
                'The full text of one post, as plain text with its headings and lists kept.',
            outputSchema: OUTPUT.post,
            inputSchema: {
                slug: z.string().describe('The post slug from list_posts'),
            },
        },
        async ({ slug }) => {
            const posts = await loadPosts(env);
            const post = posts.find(candidate => candidate.slug === slug.trim().toLowerCase());
            if (!post) {
                return asNotFound(
                    `No post with the slug "${slug}". Slugs: ${posts.map(p => p.slug).join(', ')}.`
                );
            }
            return asData({
                slug: post.slug,
                title: post.title,
                date: post.date,
                tags: post.tags ?? [],
                url: `${SITE_ORIGIN}/posts/${post.slug}/`,
                text: htmlToText(post.content),
            });
        }
    );
}
