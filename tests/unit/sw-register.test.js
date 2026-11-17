import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** navigator.serviceWorker with the parts registration touches. */
function fakeServiceWorker({ controller = null, rejects = false } = {}) {
    const listeners = [];
    return {
        controller,
        register: vi.fn(async () => {
            if (rejects) throw new Error('blocked');
            return { scope: '/' };
        }),
        addEventListener: vi.fn((type, listener, options) =>
            listeners.push({ type, listener, options })
        ),
        listeners,
    };
}

async function load({ trustedTypes } = {}) {
    vi.resetModules();
    if (trustedTypes) globalThis.trustedTypes = trustedTypes;
    else delete globalThis.trustedTypes;
    return import('../../modules/sw-register.js');
}

beforeEach(() => {
    vi.stubGlobal('location', { origin: 'https://andernet.dev' });
});
afterEach(() => {
    delete globalThis.trustedTypes;
    vi.unstubAllGlobals();
});

describe('registerServiceWorker', () => {
    it('registers /sw.js with an address made by the Trusted Types policy', async () => {
        const worker = fakeServiceWorker();
        vi.stubGlobal('navigator', { serviceWorker: worker });
        const wrapped = { trusted: 'url' };
        const { registerServiceWorker } = await load({
            trustedTypes: {
                createPolicy: () => ({ createHTML: s => s, createScriptURL: () => wrapped }),
            },
        });
        await registerServiceWorker(() => {});
        // The browser's register() takes the policy's value, not a plain string
        expect(worker.register).toHaveBeenCalledWith(wrapped);
    });

    it('registers with the plain address in a browser without Trusted Types', async () => {
        const worker = fakeServiceWorker();
        vi.stubGlobal('navigator', { serviceWorker: worker });
        const { registerServiceWorker } = await load();
        await registerServiceWorker(() => {});
        expect(worker.register).toHaveBeenCalledWith('/sw.js');
    });

    it('says the site was updated only when a worker replaces one that was in control', async () => {
        const first = fakeServiceWorker({ controller: null });
        vi.stubGlobal('navigator', { serviceWorker: first });
        const { registerServiceWorker } = await load();
        const onUpdate = vi.fn();
        await registerServiceWorker(onUpdate);
        expect(first.listeners).toEqual([]); // first install: nothing was replaced

        const later = fakeServiceWorker({ controller: {} });
        vi.stubGlobal('navigator', { serviceWorker: later });
        await registerServiceWorker(onUpdate);
        expect(later.listeners).toHaveLength(1);
        expect(later.listeners[0]).toMatchObject({
            type: 'controllerchange',
            options: { once: true },
        });
        later.listeners[0].listener();
        expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    it('a registration that fails is logged and never thrown', async () => {
        vi.stubGlobal('navigator', { serviceWorker: fakeServiceWorker({ rejects: true }) });
        const { registerServiceWorker } = await load();
        await expect(registerServiceWorker(() => {})).resolves.toBeUndefined();
    });
});
