/**
 * "N here now" (worker/presence.js): the Durable Object's behaviour with fake sockets, and the
 * handler's guards. The runtime's WebSocketPair and auto-response are replaced by fakes, so no
 * test opens a connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index.js';
import { MAX_SOCKETS, Presence, handlePresenceRequest } from '../../worker/presence.js';

const OPEN = 1;
const socket = (readyState = OPEN) => ({ readyState, send: vi.fn(), close: vi.fn() });

/** The Presence object over a fake ctx whose open sockets are `sockets`. */
function makePresence(sockets = []) {
    const ctx = {
        getWebSockets: () => sockets,
        acceptWebSocket: vi.fn(ws => sockets.push(ws)),
        setWebSocketAutoResponse: vi.fn(),
    };
    const presence = new Presence(ctx, {});
    // The real 101 response cannot be built in Node
    presence.upgrade = client => ({ upgraded: client });
    return { presence, ctx, sockets };
}

const upgrade = (headers = {}) =>
    new Request('https://andernet.dev/api/presence', {
        headers: { Upgrade: 'websocket', Origin: 'https://andernet.dev', ...headers },
    });
const counts = ws => ws.send.mock.calls.map(([message]) => JSON.parse(message).count);

beforeEach(() => {
    globalThis.WebSocketPair = class {
        constructor() {
            this[0] = socket();
            this[1] = socket();
        }
    };
    globalThis.WebSocketRequestResponsePair = class {
        constructor(request, response) {
            this.request = request;
            this.response = response;
        }
    };
});
afterEach(() => {
    delete globalThis.WebSocketPair;
    delete globalThis.WebSocketRequestResponsePair;
});

describe('the Presence object', () => {
    it('has the runtime answer "ping" with "pong", so a quiet page never wakes it', () => {
        const { ctx } = makePresence();
        const [pair] = ctx.setWebSocketAutoResponse.mock.calls[0];
        expect(pair).toMatchObject({ request: 'ping', response: 'pong' });
    });

    it('turns away anything that is not a WebSocket upgrade', async () => {
        const { presence, ctx } = makePresence();
        const response = await presence.fetch(new Request('https://x.dev/presence'));
        expect(response.status).toBe(426);
        expect(ctx.acceptWebSocket).not.toHaveBeenCalled();
    });

    it('accepts a page and tells every open page the new count, the newcomer included', async () => {
        const existing = socket();
        const { presence, ctx } = makePresence([existing]);
        const result = await presence.fetch(upgrade());

        const [accepted] = ctx.acceptWebSocket.mock.calls[0];
        expect(result.upgraded).toBeDefined(); // the browser gets its end of the pair
        expect(counts(existing)).toEqual([2]);
        expect(counts(accepted)).toEqual([2]);
    });

    it('tells the others the count when a page closes, without counting the one leaving', () => {
        const leaving = socket();
        const stays = socket();
        const { presence } = makePresence([leaving, stays]);
        presence.webSocketClose(leaving);

        expect(leaving.close).toHaveBeenCalledWith(1000, 'bye');
        expect(counts(stays)).toEqual([1]);
        expect(leaving.send).not.toHaveBeenCalled();
    });

    it('does the same when a socket errors, and ignores sockets that are not open', () => {
        const broken = socket();
        const closing = socket(2);
        const stays = socket();
        const { presence } = makePresence([broken, closing, stays]);
        presence.webSocketError(broken);
        expect(counts(stays)).toEqual([1]);
        expect(closing.send).not.toHaveBeenCalled();
    });

    it('keeps telling the others even if one socket cannot be written to', () => {
        const dead = socket();
        dead.send.mockImplementation(() => {
            throw new Error('gone');
        });
        const stays = socket();
        const { presence } = makePresence([dead, stays]);
        expect(() => presence.broadcast()).not.toThrow();
        expect(counts(stays)).toEqual([2]);
    });

    it('refuses new pages at the limit, and does not accept them', async () => {
        const full = Array.from({ length: MAX_SOCKETS }, () => socket());
        const { presence, ctx } = makePresence(full);
        const response = await presence.fetch(upgrade());
        expect(response.status).toBe(503);
        expect(ctx.acceptWebSocket).not.toHaveBeenCalled();
    });

    it('closes a socket that sends anything but a short text, and leaves "pings" alone', () => {
        const { presence } = makePresence();
        const long = socket();
        presence.webSocketMessage(long, 'x'.repeat(65));
        expect(long.close).toHaveBeenCalledWith(1009, expect.any(String));

        const binary = socket();
        presence.webSocketMessage(binary, new ArrayBuffer(4));
        expect(binary.close).toHaveBeenCalled();

        const fine = socket();
        presence.webSocketMessage(fine, 'hi');
        expect(fine.close).not.toHaveBeenCalled();
    });

    it('sends the count and nothing else: no address, place or identity', async () => {
        const existing = socket();
        const { presence } = makePresence([existing]);
        await presence.fetch(upgrade({ 'CF-Connecting-IP': '203.0.113.9' }));
        const sent = existing.send.mock.calls[0][0];
        expect(JSON.parse(sent)).toEqual({ count: 2 });
        expect(sent).not.toMatch(/203\.0\.113/);
    });
});

describe('the handler', () => {
    const stub = () => ({ fetch: vi.fn(async () => new Response('through')) });
    const envWith = (overrides = {}) => {
        const object = stub();
        return {
            object,
            env: {
                PRESENCE: { idFromName: vi.fn(name => `id:${name}`), get: vi.fn(() => object) },
                ...overrides,
            },
        };
    };

    it('hands a page of this site to the one shared object', async () => {
        const { env, object } = envWith();
        const request = upgrade();
        const response = await handlePresenceRequest(request, env);
        expect(await response.text()).toBe('through');
        expect(env.PRESENCE.idFromName).toHaveBeenCalledWith('site');
        expect(object.fetch).toHaveBeenCalledWith(request);
    });

    it('accepts localhost (local development) and the github.io mirror', async () => {
        for (const Origin of ['http://localhost:8000', 'https://and3rn3t.github.io']) {
            const { env } = envWith();
            expect((await handlePresenceRequest(upgrade({ Origin }), env)).status).toBe(200);
        }
    });

    it.each([
        ['another site', { Origin: 'https://evil.example' }],
        ['a look-alike of localhost', { Origin: 'http://localhost.evil.com' }],
        ['a client with no Origin at all', { Origin: '' }],
    ])('refuses %s, without touching the object', async (_name, headers) => {
        const { env, object } = envWith();
        const response = await handlePresenceRequest(upgrade(headers), env);
        expect(response.status).toBe(403);
        expect(object.fetch).not.toHaveBeenCalled();
    });

    it('answers 426 to a plain request and 405 to a POST', async () => {
        const { env } = envWith();
        const plain = new Request('https://andernet.dev/api/presence');
        expect((await handlePresenceRequest(plain, env)).status).toBe(426);
        const post = new Request('https://andernet.dev/api/presence', { method: 'POST' });
        expect((await handlePresenceRequest(post, env)).status).toBe(405);
    });

    it('is unavailable without the binding', async () => {
        expect((await handlePresenceRequest(upgrade(), {})).status).toBe(503);
    });

    it('limits how fast one address can open pages, and says when to retry', async () => {
        const limit = vi.fn(async () => ({ success: false }));
        const { env, object } = envWith({ PRESENCE_LIMITER: { limit } });
        const response = await handlePresenceRequest(
            upgrade({ 'CF-Connecting-IP': '198.51.100.7' }),
            env
        );
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
        expect(limit).toHaveBeenCalledWith({ key: 'presence:198.51.100.7' });
        expect(object.fetch).not.toHaveBeenCalled();
    });
});

describe('through the Worker', () => {
    it('is routed at /api/presence and at the workers.dev address, and its failures are not 404s', async () => {
        const noOrigin = path =>
            worker.fetch(
                new Request(`https://andernet.dev${path}`, { headers: { Upgrade: 'websocket' } }),
                {},
                {}
            );
        expect((await noOrigin('/api/presence')).status).toBe(403);
        expect((await noOrigin('/presence')).status).toBe(403);
    });

    it('exports the Durable Object class from its entry point, as Cloudflare requires', async () => {
        const entry = await import('../../worker/index.js');
        expect(entry.Presence).toBe(Presence);
    });
});
