import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGIN = 'https://andernet.dev';

/** A Trusted Types factory that wraps values the way a browser's does, so a test can tell. */
function fakeFactory({ throws = false } = {}) {
    const created = [];
    return {
        created,
        createPolicy: vi.fn((name, rules) => {
            if (throws) throw new TypeError('Policy "andernet" disallowed');
            created.push(name);
            return {
                createHTML: input => ({ trusted: 'html', value: rules.createHTML(input) }),
                createScriptURL: input => ({ trusted: 'url', value: rules.createScriptURL(input) }),
            };
        }),
    };
}

async function load(factory) {
    vi.resetModules();
    if (factory) globalThis.trustedTypes = factory;
    else delete globalThis.trustedTypes;
    return import('../../modules/utils/html.js');
}

beforeEach(() => {
    vi.stubGlobal('location', { origin: ORIGIN });
});
afterEach(() => {
    delete globalThis.trustedTypes;
    vi.unstubAllGlobals();
});

describe('checkScriptUrl', () => {
    it('allows this site and the two Cloudflare scripts, nothing else', async () => {
        const { checkScriptUrl } = await load();
        for (const url of [
            '/modules/x.js',
            `${ORIGIN}/modules/x.js`,
            'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
            'https://static.cloudflareinsights.com/beacon.min.js',
        ]) {
            expect(checkScriptUrl(url, ORIGIN), url).toBe(url);
        }
        for (const url of [
            'https://evil.example/x.js',
            'https://challenges.cloudflare.com.evil.example/x.js',
            'http://static.cloudflareinsights.com/beacon.min.js',
            'https://cloudflareinsights.com/x.js',
            '//evil.example/x.js',
        ]) {
            expect(() => checkScriptUrl(url, ORIGIN), url).toThrow(TypeError);
        }
    });
});

describe('with Trusted Types', () => {
    it('makes one policy, named in the CSP, and wraps what it is given', async () => {
        const factory = fakeFactory();
        const { POLICY_NAME, trustedHtml, trustedScriptUrl } = await load(factory);
        expect(factory.created).toEqual([POLICY_NAME]);
        expect(POLICY_NAME).toBe('andernet');
        expect(trustedHtml('<p>a</p>')).toEqual({ trusted: 'html', value: '<p>a</p>' });
        expect(trustedScriptUrl('/modules/x.js')).toEqual({
            trusted: 'url',
            value: '/modules/x.js',
        });
    });

    it('refuses a script address that is not allowed, instead of wrapping it', async () => {
        const { trustedScriptUrl } = await load(fakeFactory());
        expect(() => trustedScriptUrl('https://evil.example/x.js')).toThrow(TypeError);
    });

    it('falls back to plain strings when the policy cannot be made', async () => {
        const { trustedHtml } = await load(fakeFactory({ throws: true }));
        expect(trustedHtml('<p>a</p>')).toBe('<p>a</p>');
    });
});

describe('without Trusted Types (an older browser)', () => {
    it('returns the plain string, which is what that browser accepts', async () => {
        const { trustedHtml, trustedScriptUrl } = await load();
        expect(trustedHtml('<p>a</p>')).toBe('<p>a</p>');
        expect(trustedScriptUrl('/modules/x.js')).toBe('/modules/x.js');
    });

    it('still checks a script address', async () => {
        const { trustedScriptUrl } = await load();
        expect(() => trustedScriptUrl('https://evil.example/x.js')).toThrow(TypeError);
    });
});
