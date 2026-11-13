/**
 * "N here now": a Durable Object that holds the open WebSockets of the pages being looked at
 * right now, and tells each of them how many there are.
 *
 * It stores nothing, not even in memory beyond the sockets themselves, and sends no one's
 * address, place or identity: only a number. It uses the WebSocket Hibernation API, so while
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
     * The browser only ever sends "ping", and the runtime answers that itself (see the
     * constructor) without calling this. Whatever gets here is not our client, and each message
     * would wake this billed object, so the connection is closed at the first one.
     */
    webSocketMessage(ws) {
        ws.close(1008, 'unexpected message');
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
        const message = JSON.stringify({ count: open.length });
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
