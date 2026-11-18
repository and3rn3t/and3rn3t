import { describe, expect, it } from 'vitest';
import worker from '../../worker/index.js';
import {
    cacheableJson,
    guardGet,
    jsonResponse,
    methodNotAllowed,
    preflight,
} from '../../worker/http.js';

const request = (method = 'GET', origin = 'https://andernet.dev') =>
    new Request('https://andernet.dev/api/edge', { method, headers: { Origin: origin } });

describe('guardGet', () => {
    it('lets a GET through', () => {
        expect(guardGet(request('GET'))).toBeNull();
    });

    it('answers a pre-flight with the CORS headers', () => {
        const response = guardGet(request('OPTIONS'));
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://andernet.dev');
    });

    it('refuses another method with 405, Allow and CORS headers', async () => {
        const response = guardGet(request('POST'));
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET, OPTIONS');
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://andernet.dev');
        expect(await response.text()).toBe('Method not allowed');
    });
});

describe('the other helpers', () => {
    it('methodNotAllowed names the methods the route takes', () => {
        expect(methodNotAllowed(request('GET'), 'POST').headers.get('Allow')).toBe('POST');
    });

    it('does not echo an origin the site does not allow', () => {
        const response = preflight(request('OPTIONS', 'https://evil.example'));
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://andernet.dev');
    });

    it('jsonResponse carries the status and CORS', async () => {
        const response = jsonResponse({ a: 1 }, request(), 503);
        expect(response.status).toBe(503);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        expect(await response.json()).toEqual({ a: 1 });
    });

    it('cacheableJson is a 200 with a max-age, whatever it stands for', async () => {
        const response = cacheableJson({ __negative: { error: 'x', status: 502 } }, 60);
        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
        expect((await response.json()).__negative.status).toBe(502);
    });
});

describe('through the Worker', () => {
    const call = (path, init) =>
        worker.fetch(
            new Request(`https://andernet.dev${path}`, {
                ...init,
                headers: { Origin: 'https://andernet.dev' },
            }),
            {},
            {}
        );

    it('/api/health answers with CORS, so a page can read it', async () => {
        const response = await call('/api/health');
        expect(response.status).toBe(200);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://andernet.dev');
        expect(await response.json()).toEqual({ ok: true, version: null });
    });

    it.each(['/api/edge', '/api/stats', '/api/activity'])(
        '%s refuses a POST with a readable 405',
        async path => {
            const response = await call(path, { method: 'POST' });
            expect(response.status).toBe(405);
            expect(response.headers.get('Allow')).toBe('GET, OPTIONS');
            expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
                'https://andernet.dev'
            );
        }
    );

    it('an unknown route is a plain 404, and "__proto__" is not a route', async () => {
        expect((await call('/api/nope')).status).toBe(404);
        expect((await call('/api/__proto__')).status).toBe(404);
    });
});
