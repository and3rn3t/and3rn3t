/**
 * Page transitions between a project's card and its page.
 *
 * Every page opts in to cross-document view transitions with an inline @view-transition rule in
 * its <head> (VIEW_TRANSITION_CSS in scripts/templates/chrome.mjs), which cross-fades the whole page. This adds the part that makes it feel connected: the project's image
 * and title are named on both sides, so the browser morphs one into the other.
 *
 * The names are given only while navigating, in the pageswap (leaving) and pagereveal
 * (arriving) events, so a theme switch (a same-page transition) never splits these elements out
 * of the page. Elements opt in with data-vt="media" or data-vt="title"; cards also carry
 * data-page="<slug>", which is how a card is matched to the page being left or entered.
 *
 * A CLASSIC script, loaded from <head> without defer or type="module": pagereveal fires before
 * the first render, which a deferred script can miss. It uses no import or export. Browsers
 * without view transitions never fire these events, so it does nothing there.
 */
(function () {
    const NAMES = { media: 'project-media', title: 'project-title' };

    /** "/projects/health/" -> "health", or null for any other page. */
    const projectSlug = url => {
        try {
            const match = new URL(url, location.href).pathname.match(/^\/projects\/([^/]+)\/?$/);
            return match ? decodeURIComponent(match[1]) : null;
        } catch {
            return null;
        }
    };

    /** Name the image and title inside `root` for the transition. */
    const nameWithin = root => {
        for (const element of root.querySelectorAll('[data-vt]')) {
            const name = NAMES[element.dataset.vt];
            if (name) element.style.viewTransitionName = name;
        }
    };

    /**
     * Name the right elements on this page for a navigation between a card and a page:
     * the card for `slug` (on the home page), or the page's own image and title.
     */
    const nameFor = slug => {
        if (projectSlug(location.href)) {
            nameWithin(document); // a project page: its own image and title
        } else if (slug) {
            const card = document.querySelector(`[data-page="${CSS.escape(slug)}"]`);
            if (card) nameWithin(card);
        }
    };

    // Leaving this page: name what the next page will also name
    addEventListener('pageswap', event => {
        if (!event.viewTransition) return;
        const to = event.activation?.entry?.url;
        const from = location.href;
        // Only a project's card <-> its page; any other navigation just cross-fades
        if (projectSlug(from) ? !projectSlug(to) : projectSlug(to)) {
            nameFor(projectSlug(to) ?? projectSlug(from));
        }
    });

    // Arriving on this page: name the same things, so there is something to morph into
    addEventListener('pagereveal', event => {
        if (!event.viewTransition) return;
        const from = globalThis.navigation?.activation?.from?.url;
        if (!from) return;
        if (projectSlug(location.href) ? !projectSlug(from) : projectSlug(from)) {
            nameFor(projectSlug(from) ?? projectSlug(location.href));
        }
    });
})();
