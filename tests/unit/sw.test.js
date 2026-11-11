// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://andernet.dev';
const source = readFileSync(fileURLToPath(new URL('../../sw.js', import.meta.url)), 'utf8');

/** Run the real sw.js in a sandbox and return its registered event listeners. */
function loadServiceWorker() {
    const listeners = {};
    const cache = {
        add: vi.fn(async () => {}),
        match: vi.fn(async () => undefined),
        put: vi.fn(async () => {}),
    };
    const fetchMock = vi.fn(async () => new Response('network'));
    const self = {
        location: { origin: ORIGIN },
        addEventListener: (type, listener) => {
            listeners[type] = listener;
        },
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
    };
    runInNewContext(source, {
        self,
        caches: {
            open: async () => cache,
            match: async () => undefined,
            keys: async () => [],
            delete: async () => true,
        },
        fetch: fetchMock,
        console,
        URL,
        Response,
        Headers,
    });
    return { listeners, fetchMock };
}

/** Dispatch a fetch event; report whether the worker took over the request. */
async function dispatch(listeners, url, { method = 'GET', mode = 'cors' } = {}) {
    let response;
    const event = {
        request: { method, url, mode },
        respondWith: promise => {
            response = promise;
        },
    };
    listeners.fetch(event);
    if (response) await response;
    return { handled: Boolean(response) };
}

describe('service worker routing', () => {
    it.each([
        ['the Turnstile script', 'https://challenges.cloudflare.com/turnstile/v0/api.js'],
        ['the Worker guestbook', 'https://and3rn3t-portfolio.andernet.workers.dev/guestbook'],
        ['the Worker activity feed', 'https://and3rn3t-portfolio.andernet.workers.dev/activity'],
        ['the GitHub API', 'https://api.github.com/users/and3rn3t'],
        ['the analytics beacon', 'https://static.cloudflareinsights.com/beacon.min.js'],
        ['a third-party image', 'https://ghchart.rshah.org/16a34a/and3rn3t'],
    ])('leaves cross-origin requests to the network: %s', async (_label, url) => {
        const { listeners, fetchMock } = loadServiceWorker();
        const { handled } = await dispatch(listeners, url);
        expect(handled).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ['code', `${ORIGIN}/modules/ui.js`],
        ['styles', `${ORIGIN}/styles.css`],
        ['data', `${ORIGIN}/github-data.json`],
        ['a font', `${ORIGIN}/fonts/inter-variable.woff2`],
    ])('still handles same-origin %s', async (_label, url) => {
        const { listeners } = loadServiceWorker();
        const { handled } = await dispatch(listeners, url);
        expect(handled).toBe(true);
    });

    it('still handles same-origin navigations', async () => {
        const { listeners } = loadServiceWorker();
        const { handled } = await dispatch(listeners, `${ORIGIN}/`, { mode: 'navigate' });
        expect(handled).toBe(true);
    });

    it('ignores non-GET requests', async () => {
        const { listeners } = loadServiceWorker();
        const { handled } = await dispatch(listeners, `${ORIGIN}/modules/ui.js`, {
            method: 'POST',
        });
        expect(handled).toBe(false);
    });
});
