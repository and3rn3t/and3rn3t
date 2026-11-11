/**
 * Legacy Links Module
 *
 * Old shared links used a hash to point at one thing on the home page. Both now have real
 * pages, so send them there:
 *   #post/<slug>     ->  /posts/<slug>/
 *   #project/<slug>  ->  /projects/<slug>/
 * (A project's modal used #project/<slug>; every one of those slugs has a page.)
 */

import { debug } from './debug.js';
import { projectPagePath } from './utils/projects.js';

class LegacyLinks {
    init() {
        this.#redirect();
        globalThis.addEventListener('hashchange', () => this.#redirect());
        debug.log('[LegacyLinks] Initialized');
    }

    #redirect() {
        const { hash } = globalThis.location;

        if (hash.startsWith('#post/')) {
            const slug = decodeURIComponent(hash.slice('#post/'.length));
            // Only a post that exists: the rows on the page are the posts there are
            if (document.querySelector(`#blog-posts [data-slug="${CSS.escape(slug)}"]`)) {
                globalThis.location.replace(`/posts/${encodeURIComponent(slug)}/`);
            }
        } else if (hash.startsWith('#project/')) {
            const slug = decodeURIComponent(hash.slice('#project/'.length));
            if (slug) globalThis.location.replace(projectPagePath(slug.toLowerCase()));
        }
    }
}

export const legacyLinks = new LegacyLinks();
