/**
 * "N here now": a Durable Object that holds the open WebSockets of the pages being looked at
 * right now, and tells each of them how many there are.
 *
 * It stores nothing, not even in memory beyond the sockets themselves, and sends no one's
 * address, place or identity: only a number (and, for pages that opted in to the lab's shared hero,
 * where another visitor's pointer just was: see "Shared hero" below). It uses the WebSocket Hibernation API, so while
 * nobody is sending anything the object is evicted from memory and costs no duration; the
 * browser's "ping" is answered by the runtime without waking it.
 *
 * Workers-compatible: no Node built-ins.
 */

import { DurableObject } from 'cloudflare:workers';
import { isAllowedOrigin } from './origin.js';

/** More than this many open pages and new ones are turned away: the object is one thread. */
export const MAX_SOCKETS = 500;
const OPEN = 1;

// ── Shared hero (lab experiment `hero-shared`, roadmap 15.5) ──────────────────
// A page that opts in sends "share". It then sends "g <x> <y>" (a pointer position over the hero,
// each 0 to 255) while its visitor moves the pointer, and receives the same from the other pages
// that opted in. Nothing is stored or recorded, nobody is named, and a position is relayed once and
// forgotten. Every incoming message wakes this billed object, so the limits are small: at most
// MAX_SHARING pages take part, each gust faster than MIN_GUST_MS after the last is dropped, and a
// page that sends anything else is closed, as before.
export const MAX_SHARING = 25;
export const MIN_GUST_MS = 100;
const GUST = /^g (\d{1,3}) (\d{1,3})$/;

/** The position in a gust message, or null for anything that is not one. */
export function parseGust(message) {
    const match = typeof message === 'string' ? GUST.exec(message) : null;
    if (!match) return null;
    const x = Number(match[1]);
    const y = Number(match[2]);
    return x <= 255 && y <= 255 ? [x, y] : null;
}

/** When each socket last sent a gust. In memory only, and lost when the object hibernates, which is fine: that takes seconds. */
const lastGust = new WeakMap();

/** Whether this socket opted in. The flag is its attachment, which survives hibernation. */
const isSharing = ws => ws.deserializeAttachment?.()?.sharing === true;

export class Presence extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        // Answered by the runtime itself, without waking the object
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }

    /** The 101 response that hands the browser its end of the socket (a method so tests can replace it). */
    upgrade(client) {
        return new Response(null, { status: 101, webSocket: client });
    }

    async fetch(request) {
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
            return new Response('Expected a WebSocket upgrade', { status: 426 });
        }
        if (this.ctx.getWebSockets().length >= MAX_SOCKETS) {
            return new Response('Too many open pages', { status: 503 });
        }
        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server);
        this.broadcast();
        return this.upgrade(client);
    }

    /**
     * The browser's "ping" is answered by the runtime (see the constructor) without calling this.
     * What does get here is the shared hero's "share" and "g x y", from a page that opted in. Whatever
     * else arrives is not our client, and each message wakes this billed object, so that
     * connection is closed at the first one.
     */
    webSocketMessage(ws, message) {
        if (message === 'share') {
            if (isSharing(ws)) return;
            if (this.sharing().length >= MAX_SHARING) {
                ws.send(JSON.stringify({ share: false }));
                return;
            }
            ws.serializeAttachment({ sharing: true });
            this.broadcast();
            return;
        }
        const gust = parseGust(message);
        if (gust && isSharing(ws)) {
            this.relay(ws, gust);
            return;
        }
        ws.close(1008, 'unexpected message');
    }

    /** The open sockets that opted in to the shared hero. */
    sharing(leaving) {
        return this.ctx
            .getWebSockets()
            .filter(ws => ws !== leaving && ws.readyState === OPEN && isSharing(ws));
    }

    /**
     * Pass one pointer position to every other page that opted in. A gust that comes sooner than
     * MIN_GUST_MS after that page's last one is dropped, not an error: a fast pointer is not abuse.
     */
    relay(from, [x, y]) {
        const now = Date.now();
        if (now - (lastGust.get(from) ?? 0) < MIN_GUST_MS) return;
        lastGust.set(from, now);
        const message = JSON.stringify({ g: [x, y] });
        for (const ws of this.sharing(from)) {
            try {
                ws.send(message);
            } catch {
                // Gone between the filter and the send: its close event follows
            }
        }
    }

    webSocketClose(ws) {
        try {
            ws.close(1000, 'bye');
        } catch {
            // Already closed
        }
        this.broadcast(ws);
    }

    webSocketError(ws) {
        this.broadcast(ws);
    }

    /** Tell every open page the count. `leaving` is a socket that is closing and no longer counts. */
    broadcast(leaving) {
        const open = this.ctx
            .getWebSockets()
            .filter(ws => ws !== leaving && ws.readyState === OPEN);
        const sharing = open.filter(isSharing).length;
        const message = JSON.stringify({ count: open.length, sharing });
        for (const ws of open) {
            try {
                ws.send(message);
            } catch {
                // A socket that went away between the filter and the send: its own close event follows
            }
        }
    }
}

/**
 * GET /presence: the WebSocket upgrade. Only a page on this site (or localhost) may open one:
 * a socket is a connection held open on a single shared object, so it is not offered to
 * everyone, and each address may only open so many a minute.
 * @param {Request} request
 * @param {{ PRESENCE?: DurableObjectNamespace, PRESENCE_LIMITER?: { limit: Function } }} env
 */
export async function handlePresenceRequest(request, env) {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
    }
    // A browser always sends Origin on a WebSocket; a missing one is not a browser
    if (!isAllowedOrigin(request.headers.get('Origin') ?? '')) {
        return new Response('Forbidden', { status: 403 });
    }
    if (!env.PRESENCE) return new Response('Presence is not available', { status: 503 });

    if (env.PRESENCE_LIMITER) {
        const key = `presence:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
        const { success } = await env.PRESENCE_LIMITER.limit({ key });
        if (!success) {
            return new Response('Too many requests', {
                status: 429,
                headers: { 'Retry-After': '60' },
            });
        }
    }
    return env.PRESENCE.get(env.PRESENCE.idFromName('site')).fetch(request);
}
