/**
 * "N here now" (worker/presence.js): the Durable Object's behaviour with fake sockets, and the
 * handler's guards. The runtime's WebSocketPair and auto-response are replaced by fakes, so no
 * test opens a connection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index.js';
import {
    MAX_SHARING,
    MAX_SOCKETS,
    MIN_GUST_MS,
    Presence,
    handlePresenceRequest,
    parseGust,
} from '../../worker/presence.js';

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

    // The runtime answers "ping" itself, so a real ping never reaches the object: anything that
    // does would wake it (and bill it) each time, and is closed at the first one
    it.each([
        ['a short text', 'hi'],
        ['an empty text', ''],
        ['a long text', 'x'.repeat(65)],
        ['the word the runtime would have answered', 'ping'],
        ['binary', new ArrayBuffer(4)],
    ])('closes a socket on the first message that reaches the object: %s', (_name, message) => {
        const { presence } = makePresence();
        const ws = socket();
        presence.webSocketMessage(ws, message);
        expect(ws.close).toHaveBeenCalledWith(1008, expect.any(String));
    });

    it('sends the count and nothing else: no address, place or identity', async () => {
        const existing = socket();
        const { presence } = makePresence([existing]);
        await presence.fetch(upgrade({ 'CF-Connecting-IP': '203.0.113.9' }));
        const sent = existing.send.mock.calls[0][0];
        expect(JSON.parse(sent)).toEqual({ count: 2, sharing: 0 });
        expect(sent).not.toMatch(/203\.0\.113/);
    });
});

describe('the shared hero (lab experiment hero-shared)', () => {
    /** A socket with an attachment, which is how a real one remembers it opted in across hibernation. */
    const attached = (state = null) => {
        let attachment = state;
        return {
            ...socket(),
            serializeAttachment: vi.fn(value => {
                attachment = value;
            }),
            deserializeAttachment: () => attachment,
        };
    };
    const sharer = () => attached({ sharing: true });
    const sent = ws => ws.send.mock.calls.map(([message]) => JSON.parse(message));
    const gusts = ws => sent(ws).filter(message => message.g);

    afterEach(() => vi.useRealTimers());

    it('parses "g x y" with two numbers from 0 to 255, and nothing else', () => {
        expect(parseGust('g 0 255')).toEqual([0, 255]);
        expect(parseGust('g 12 200')).toEqual([12, 200]);
        for (const bad of [
            'g 256 1',
            'g 1',
            'g 1 2 3',
            'G 1 2',
            'g -1 2',
            'g 1.5 2',
            'g  1 2',
            'g 1 2\n',
            '',
            'share',
            5,
            null,
            new ArrayBuffer(3),
        ]) {
            expect(parseGust(bad), String(bad)).toBeNull();
        }
    });

    it('"share" opts a page in, remembers it in the attachment only, and tells everyone the count', () => {
        const ws = attached();
        const other = attached();
        const { presence } = makePresence([ws, other]);
        presence.webSocketMessage(ws, 'share');
        expect(ws.serializeAttachment).toHaveBeenCalledWith({ sharing: true });
        expect(ws.close).not.toHaveBeenCalled();
        expect(sent(other)).toEqual([{ count: 2, sharing: 1 }]);
    });

    it('opting in twice changes nothing', () => {
        const ws = sharer();
        const { presence } = makePresence([ws]);
        presence.webSocketMessage(ws, 'share');
        expect(ws.serializeAttachment).not.toHaveBeenCalled();
        expect(ws.send).not.toHaveBeenCalled();
    });

    it('relays a gust to the other pages that opted in, and to no one else', () => {
        const from = sharer();
        const sharing = sharer();
        const watching = attached(); // open, but never opted in
        const { presence } = makePresence([from, sharing, watching]);
        presence.webSocketMessage(from, 'g 12 200');
        expect(gusts(sharing)).toEqual([{ g: [12, 200] }]);
        expect(from.send).not.toHaveBeenCalled(); // not echoed back
        expect(watching.send).not.toHaveBeenCalled();
    });

    it('relays only a position: nothing about who sent it', () => {
        const from = sharer();
        const sharing = sharer();
        const { presence } = makePresence([from, sharing]);
        presence.webSocketMessage(from, 'g 1 2');
        expect(sharing.send.mock.calls[0][0]).toBe('{"g":[1,2]}');
        expect(from.serializeAttachment).not.toHaveBeenCalled();
    });

    it('closes a page that sends a gust without opting in, and one that sends a malformed gust', () => {
        const { presence } = makePresence();
        const outsider = attached();
        presence.webSocketMessage(outsider, 'g 1 2');
        expect(outsider.close).toHaveBeenCalledWith(1008, expect.any(String));
        const sharing = sharer();
        presence.webSocketMessage(sharing, 'g 999 2');
        expect(sharing.close).toHaveBeenCalledWith(1008, expect.any(String));
    });

    it('drops a gust that follows the last one too soon, and relays the next one after the wait', () => {
        vi.useFakeTimers();
        vi.setSystemTime(1_000_000);
        const from = sharer();
        const sharing = sharer();
        const { presence } = makePresence([from, sharing]);
        presence.webSocketMessage(from, 'g 1 1');
        vi.setSystemTime(1_000_000 + MIN_GUST_MS - 1);
        presence.webSocketMessage(from, 'g 2 2');
        expect(from.close).not.toHaveBeenCalled(); // a fast pointer is not abuse
        vi.setSystemTime(1_000_000 + MIN_GUST_MS);
        presence.webSocketMessage(from, 'g 3 3');
        expect(gusts(sharing)).toEqual([{ g: [1, 1] }, { g: [3, 3] }]);
    });

    it('limits how many pages take part, and tells the one turned away', () => {
        const crowd = Array.from({ length: MAX_SHARING }, sharer);
        const late = attached();
        const { presence } = makePresence([...crowd, late]);
        presence.webSocketMessage(late, 'share');
        expect(late.serializeAttachment).not.toHaveBeenCalled();
        expect(sent(late)).toEqual([{ share: false }]);
        expect(late.close).not.toHaveBeenCalled();
    });

    it('still knows who opted in after the object hibernates and wakes (the attachment is the memory)', () => {
        const from = sharer();
        const sharing = sharer();
        const sockets = [from, sharing];
        const first = makePresence(sockets).presence;
        first.webSocketMessage(from, 'g 5 5');
        const woken = makePresence(sockets).presence; // a new object over the same sockets
        vi.useFakeTimers();
        vi.setSystemTime(Date.now() + 1000);
        woken.webSocketMessage(from, 'g 6 6');
        expect(gusts(sharing).map(message => message.g)).toEqual([
            [5, 5],
            [6, 6],
        ]);
    });

    it('survives a socket that dies while it is relaying', () => {
        const from = sharer();
        const dead = sharer();
        dead.send.mockImplementation(() => {
            throw new Error('gone');
        });
        const alive = sharer();
        const { presence } = makePresence([from, dead, alive]);
        expect(() => presence.webSocketMessage(from, 'g 1 1')).not.toThrow();
        expect(gusts(alive)).toHaveLength(1);
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

    // "N here now" keeps nothing about who joined: a data point would carry the visitor's
    // Cloudflare location and a browser/agent guess
    it('writes no data point for a handshake, successful or refused, but does for other routes', async () => {
        const METRICS = { writeDataPoint: vi.fn() };
        const env = { METRICS };
        const handshake = headers =>
            new Request('https://andernet.dev/api/presence', {
                headers: { Upgrade: 'websocket', ...headers },
            });
        await worker.fetch(handshake({}), env, {}); // refused: no Origin
        await worker.fetch(handshake({ Origin: 'https://evil.example' }), env, {});
        expect(METRICS.writeDataPoint).not.toHaveBeenCalled();

        await worker.fetch(new Request('https://andernet.dev/api/health'), env, {});
        expect(METRICS.writeDataPoint).toHaveBeenCalledTimes(1);
    });

    it('exports the Durable Object class from its entry point, as Cloudflare requires', async () => {
        const entry = await import('../../worker/index.js');
        expect(entry.Presence).toBe(Presence);
    });
});
