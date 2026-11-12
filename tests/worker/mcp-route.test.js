/**
 * How the Worker hands requests to the MCP server and the discovery documents
 * (worker/index.js): the rate limit, the paths, and what the tools are given.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../worker/mcp.js', () => ({
    SERVER_VERSION: '1.0.0',
    handleMcp: vi.fn(async () => new Response('mcp-ok')),
}));

const { default: worker } = await import('../../worker/index.js');
const { handleMcp } = await import('../../worker/mcp.js');

const ctx = { waitUntil() {} };
const post = (path, headers = {}) =>
    new Request(`https://andernet.dev${path}`, { method: 'POST', headers, body: '{}' });
const limiter = success => ({ limit: vi.fn(async () => ({ success })) });

beforeEach(() => handleMcp.mockClear());

describe('POST /mcp', () => {
    it('passes the request to the MCP server, with a way to read recent activity', async () => {
        const response = await worker.fetch(post('/mcp'), {}, ctx);
        expect(await response.text()).toBe('mcp-ok');
        const [, , , deps] = handleMcp.mock.calls[0];
        expect(typeof deps.getActivity).toBe('function');
    });

    it('is limited per client address, and a limited request never reaches the server', async () => {
        const env = { MCP_LIMITER: limiter(false) };
        const response = await worker.fetch(
            post('/mcp', { 'CF-Connecting-IP': '203.0.113.7' }),
            env,
            ctx
        );
        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('60');
        expect((await response.json()).error).toBe('rate_limited');
        expect(env.MCP_LIMITER.limit).toHaveBeenCalledWith({ key: 'mcp:203.0.113.7' });
        expect(handleMcp).not.toHaveBeenCalled();
    });

    it('lets a request through when the limiter allows it', async () => {
        const env = { MCP_LIMITER: limiter(true) };
        const response = await worker.fetch(
            post('/mcp', { 'CF-Connecting-IP': '203.0.113.7' }),
            env,
            ctx
        );
        expect(await response.text()).toBe('mcp-ok');
        expect(env.MCP_LIMITER.limit).toHaveBeenCalledOnce();
    });

    it('works without the limiter binding (local dev), keyed "unknown" when there is no address', async () => {
        expect((await worker.fetch(post('/mcp'), {}, ctx)).status).toBe(200);
        const env = { MCP_LIMITER: limiter(true) };
        await worker.fetch(post('/mcp'), env, ctx);
        expect(env.MCP_LIMITER.limit).toHaveBeenCalledWith({ key: 'mcp:unknown' });
    });

    // The zone route is andernet.dev/mcp only; under /api there is nothing to serve
    it.each(['/api/mcp', '/mcp/', '/mcp/x'])('%s is not the MCP endpoint', async path => {
        const response = await worker.fetch(post(path), {}, ctx);
        expect(response.status).toBe(404);
        expect(handleMcp).not.toHaveBeenCalled();
    });
});

describe('discovery documents through the Worker', () => {
    it.each([
        ['/.well-known/api-catalog', 'application/linkset+json'],
        ['/.well-known/mcp/server-card.json', 'application/json'],
        ['/.well-known/agent-skills/index.json', 'application/json'],
        ['/.well-known/ai-catalog.json', 'application/json'],
        ['/api/openapi.json', 'application/vnd.oai.openapi+json;version=3.1'],
    ])('serves %s as %s', async (path, type) => {
        const response = await worker.fetch(new Request(`https://andernet.dev${path}`), {}, ctx);
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe(type);
        expect(await response.json()).toBeTypeOf('object');
    });

    it('still answers 404 for an unknown path', async () => {
        const response = await worker.fetch(
            new Request('https://andernet.dev/.well-known/nope'),
            {},
            ctx
        );
        expect(response.status).toBe(404);
    });
});
