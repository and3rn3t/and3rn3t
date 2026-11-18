/**
 * Response helpers shared by the Worker's handlers: JSON with CORS, the pre-flight answer, the
 * 405 answer, and a JSON body shaped for the Cache API. One place, so the routes cannot drift
 * apart (a 405 once reached the browser without CORS headers and read as a CORS error).
 *
 * Not used by discovery.js, whose documents are public on purpose and answer `*`.
 *
 * Workers-compatible: no Node built-ins.
 */

import { FALLBACK_ORIGIN, isAllowedOrigin } from './origin.js';

/**
 * CORS headers for a browser request: the caller's origin when this site allows it, else the
 * site's own.
 * @param {Request} request
 * @returns {Record<string, string>}
 */
export function corsHeaders(request) {
    const origin = request.headers.get('Origin') ?? '';
    const allowed = isAllowedOrigin(origin);
    return {
        'Access-Control-Allow-Origin': allowed ? origin : FALLBACK_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };
}

/**
 * A JSON answer with CORS headers.
 * @param {unknown} data
 * @param {Request} request
 * @param {number} [status]
 * @returns {Response}
 */
export function jsonResponse(data, request, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(request),
        },
    });
}

/**
 * The answer to a CORS pre-flight.
 * @param {Request} request
 * @returns {Response}
 */
export function preflight(request) {
    return new Response(null, { headers: corsHeaders(request) });
}

/**
 * 405, with the methods the route does take and CORS headers, so a browser sees the status and
 * not a CORS failure.
 * @param {Request} request
 * @param {string} allow - the Allow header, e.g. 'GET, OPTIONS'
 * @returns {Response}
 */
export function methodNotAllowed(request, allow) {
    return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: allow, ...corsHeaders(request) },
    });
}

/**
 * The start of a GET-only route: answers the pre-flight and refuses any other method.
 * @param {Request} request
 * @returns {Response | null} the answer to send, or null when the request is a GET
 */
export function guardGet(request) {
    if (request.method === 'OPTIONS') return preflight(request);
    if (request.method !== 'GET') return methodNotAllowed(request, 'GET, OPTIONS');
    return null;
}

/**
 * A JSON value to store in the Cache API. The cache only keeps successful responses, so a value
 * that stands for a failure (a remembered error) is stored as a 200 with a marker in the body.
 * @param {unknown} data
 * @param {number} maxAgeSeconds
 * @returns {Response}
 */
export function cacheableJson(data, maxAgeSeconds) {
    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${maxAgeSeconds}`,
        },
    });
}
