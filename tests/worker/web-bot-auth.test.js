/**
 * Web Bot Auth (worker/web-bot-auth.js). Requests are signed here with a real Ed25519 key the
 * way an agent signs them (RFC 9421), and the key directory is served by the test, so a passing
 * test means a signature made by someone else's implementation of the same spec would pass too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOW, URL_SIGNED, makeAgent, signed } from './sign-request.js';
import {
    classifySignature,
    claimsSignature,
    directoryFor,
    fetchDirectory,
    parseSignatureInput,
    parseSignatures,
    resetDirectoryCache,
    splitMembers,
    verifyWebBotAuth,
} from '../../worker/web-bot-auth.js';

const serving = agent => ({ getDirectory: async () => agent.directory, now: NOW });

describe('verifyWebBotAuth', () => {
    let agent;
    beforeEach(async () => {
        agent = await makeAgent();
    });

    it('accepts a request signed with a key the agent publishes', async () => {
        expect(await verifyWebBotAuth(await signed(agent), serving(agent))).toEqual({
            status: 'valid',
        });
    });

    it('covers derived components and other headers too', async () => {
        const request = await signed(agent, {
            components: ['@authority', '@method', '@path', 'signature-agent'],
        });
        expect((await verifyWebBotAuth(request, serving(agent))).status).toBe('valid');
    });

    it('rejects a request changed after it was signed', async () => {
        const request = await signed(agent, {
            components: ['@authority', '@path', 'signature-agent'],
            tamper: 'https://andernet.dev/api/guestbook',
        });
        expect(await verifyWebBotAuth(request, serving(agent))).toEqual({
            status: 'invalid',
            reason: 'signature-does-not-verify',
        });
    });

    it('rejects a signature from a different key than the directory publishes', async () => {
        const other = await makeAgent();
        const request = await signed(other);
        // The directory is the first agent's, the keyid and signature are the other's
        expect((await verifyWebBotAuth(request, serving(agent))).reason).toBe(
            'signature-does-not-verify'
        );
    });

    it('rejects a key that is in the directory but signed with another private key', async () => {
        const other = await makeAgent();
        const request = await signed({ ...agent, pair: other.pair });
        expect((await verifyWebBotAuth(request, serving(agent))).reason).toBe(
            'signature-does-not-verify'
        );
    });

    it('rejects a keyid that the directory does not publish, even if the signature is good', async () => {
        const request = await signed(agent, { keyid: 'not-a-published-thumbprint' });
        expect((await verifyWebBotAuth(request, serving(agent))).reason).toBe(
            'signature-does-not-verify'
        );
    });

    it('picks the key whose thumbprint is the keyid out of a directory with several', async () => {
        const first = await makeAgent();
        const second = await makeAgent();
        const directory = { keys: [first.jwk, { kty: 'RSA', n: 'x', e: 'AQAB' }, second.jwk] };
        const getDirectory = async () => directory;
        expect(
            (await verifyWebBotAuth(await signed(second), { getDirectory, now: NOW })).status
        ).toBe('valid');
        expect(
            (await verifyWebBotAuth(await signed(first), { getDirectory, now: NOW })).status
        ).toBe('valid');
    });

    it.each([
        ['expired', { expires: NOW - 1 }, 'expired'],
        ['created far in the future', { created: NOW + 3600 }, 'created-in-the-future'],
        [
            'not covering Signature-Agent',
            { components: ['@authority'] },
            'signature-agent-not-covered',
        ],
        [
            'an unsupported component',
            { components: ['@query-param', 'signature-agent'] },
            'unsupported-component',
        ],
        [
            'a header that is not there',
            { components: ['@authority', 'signature-agent', 'x-missing'] },
            'unsupported-component',
        ],
    ])('rejects a request %s', async (_label, overrides, reason) => {
        const request = await signed(agent, overrides);
        expect(await verifyWebBotAuth(request, serving(agent))).toMatchObject({
            status: 'invalid',
            reason,
        });
    });

    it.each([
        ['http', '"http://agent.example.com"'],
        ['an address', '"https://203.0.113.9"'],
        ['a port', '"https://agent.example.com:8443"'],
        ['credentials', '"https://user@agent.example.com"'],
        ['a path', '"https://agent.example.com/dir"'],
        ['localhost', '"https://localhost"'],
        ['an internal name', '"https://db.internal"'],
        ['an unquoted value', 'https://agent.example.com'],
        ['a dictionary form', 'sig2="https://agent.example.com"'],
    ])('will not fetch a directory for %s', async (_label, signatureAgent) => {
        const getDirectory = vi.fn();
        const request = await signed(agent, { signatureAgent });
        expect((await verifyWebBotAuth(request, { getDirectory, now: NOW })).reason).toBe(
            'unusable-signature-agent'
        );
        expect(getDirectory).not.toHaveBeenCalled();
    });

    it('is invalid when the directory cannot be had, and unchecked when over the fetch limit', async () => {
        const request = await signed(agent);
        expect(
            (await verifyWebBotAuth(request, { getDirectory: async () => null, now: NOW })).reason
        ).toBe('no-key-directory');
        expect(
            await verifyWebBotAuth(request, { getDirectory: async () => 'busy', now: NOW })
        ).toEqual({
            status: 'unchecked',
            reason: 'busy',
        });
    });

    it('finds the web-bot-auth signature among others', async () => {
        const request = await signed(agent, { label: 'sig2' });
        request.headers.set(
            'Signature-Input',
            `sig1=("@method");tag="other", ${request.headers.get('Signature-Input')}`
        );
        request.headers.set('Signature', `sig1=:AAAA:, ${request.headers.get('Signature')}`);
        expect((await verifyWebBotAuth(request, serving(agent))).status).toBe('valid');
    });
});

describe('classifySignature', () => {
    it('is "unsigned" for a request with no signature, and for other kinds of signature', async () => {
        const getDirectory = vi.fn();
        expect(await classifySignature(new Request(URL_SIGNED), { getDirectory })).toEqual({
            signature: 'unsigned',
        });
        const other = new Request(URL_SIGNED, {
            headers: {
                'Signature-Input': 'sig1=("@method");tag="something-else"',
                Signature: 'sig1=:AAAA:',
            },
        });
        expect(claimsSignature(other)).toBe(false);
        expect((await classifySignature(other, { getDirectory })).signature).toBe('unsigned');
        expect(getDirectory).not.toHaveBeenCalled();
    });

    it('reports valid and invalid, with the reason for the second', async () => {
        const agent = await makeAgent();
        expect((await classifySignature(await signed(agent), serving(agent))).signature).toBe(
            'valid'
        );
        expect(
            await classifySignature(await signed(agent, { expires: NOW - 1 }), serving(agent))
        ).toEqual({
            signature: 'invalid',
            reason: 'expired',
        });
    });

    it('never throws: a check that fails to run is "unchecked"', async () => {
        const agent = await makeAgent();
        const result = await classifySignature(await signed(agent), {
            now: NOW,
            getDirectory: async () => {
                throw new Error('boom');
            },
        });
        expect(result).toEqual({ signature: 'unchecked', reason: 'error' });
    });
});

describe('parsing', () => {
    it('splits a dictionary only at top-level commas', () => {
        expect(splitMembers('a=("x,y" "z");k="1,2", b=:AA==:')).toEqual([
            'a=("x,y" "z");k="1,2"',
            'b=:AA==:',
        ]);
    });

    it('reads the signature parameters and covered components', () => {
        const input = parseSignatureInput(
            'sig1=("@authority" "signature-agent");created=5;expires=9;keyid="k";tag="web-bot-auth"'
        );
        expect(input).toMatchObject({
            label: 'sig1',
            components: [
                { name: '@authority', parameterised: false },
                { name: 'signature-agent', parameterised: false },
            ],
            params: { created: 5, expires: 9, keyid: 'k', tag: 'web-bot-auth' },
        });
        expect(parseSignatureInput('nonsense')).toBeNull();
        expect(parseSignatureInput('s=("a";sf)').components[0].parameterised).toBe(true);
    });

    it('reads signatures and ignores members that are not base64', () => {
        const signatures = parseSignatures('sig1=:AQID:, sig2=:!!:');
        expect([...signatures.get('sig1')]).toEqual([1, 2, 3]);
        expect(signatures.has('sig2')).toBe(false);
    });

    it('accepts a plain https host name, with or without a trailing slash', () => {
        expect(directoryFor('"https://Agent.Example.com/"')).toEqual({
            host: 'agent.example.com',
            url: 'https://agent.example.com/.well-known/http-message-signatures-directory',
        });
    });
});

describe('fetchDirectory', () => {
    const target = {
        host: 'agent.example.com',
        url: 'https://agent.example.com/.well-known/http-message-signatures-directory',
    };
    afterEach(() => {
        vi.unstubAllGlobals();
        resetDirectoryCache();
    });

    it('fetches once and then serves the cache, refusing redirects', async () => {
        const fetchMock = vi.fn(async () => Response.json({ keys: [{ kty: 'OKP' }] }));
        vi.stubGlobal('fetch', fetchMock);
        expect((await fetchDirectory(target, 1000)).keys).toHaveLength(1);
        await fetchDirectory(target, 2000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][1].redirect).toBe('error');
        expect(fetchMock.mock.calls[0][0]).toBe(target.url);
        await fetchDirectory(target, 1000 + 3_700_000);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['an error status', () => new Response('no', { status: 404 })],
        ['something that is not a key set', () => Response.json({ hello: 1 })],
        ['text that is not JSON', () => new Response('<html>')],
        ['a body that is too large', () => new Response('x'.repeat(20_000))],
        [
            'a declared size that is too large',
            () => new Response('{}', { headers: { 'content-length': '999999' } }),
        ],
    ])('is null for %s', async (_label, make) => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => make())
        );
        expect(await fetchDirectory(target, 1000)).toBeNull();
    });

    it('is null when the fetch fails or times out', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('timeout');
            })
        );
        expect(await fetchDirectory(target, 1000)).toBeNull();
    });

    it('allows ten uncached fetches a minute, then says busy until the minute is over', async () => {
        const fetchMock = vi.fn(async () => Response.json({ keys: [] }));
        vi.stubGlobal('fetch', fetchMock);
        for (let i = 0; i < 10; i++) {
            await fetchDirectory(
                { host: `a${i}.example.com`, url: `https://a${i}.example.com/x` },
                5000
            );
        }
        expect(
            await fetchDirectory(
                { host: 'extra.example.com', url: 'https://extra.example.com/x' },
                5000
            )
        ).toBe('busy');
        expect(fetchMock).toHaveBeenCalledTimes(10);
        const later = await fetchDirectory(
            { host: 'extra.example.com', url: 'https://extra.example.com/x' },
            5000 + 61_000
        );
        expect(later).not.toBe('busy');
    });
});
