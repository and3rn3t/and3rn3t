/**
 * Worker telemetry: the data points, the Server-Timing header, and that none of it can break a
 * response or store anything personal.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../worker/engagement.js', () => ({
    handleViewsRequest: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    handleGuestbookRequest: vi.fn().mockResolvedValue(new Response('[]', { status: 200 })),
    jsonResponse: (body, _req, status) => new Response(JSON.stringify(body), { status }),
    corsHeaders: () => ({ 'Access-Control-Allow-Origin': '*' }),
}));

const { default: worker } = await import('../../worker/index.js');
const { clientKind, recordRequest, recordTool, routeLabel, withSpan, nameRootSpan } =
    await import('../../worker/telemetry.js');

const metrics = () => ({ writeDataPoint: vi.fn() });
const get = (path, headers = {}) =>
    new Request(`https://andernet.dev${path}`, { method: 'GET', headers });

describe('routeLabel', () => {
    it('names known routes with or without the /api prefix', () => {
        expect(routeLabel('/api/views')).toBe('/views');
        expect(routeLabel('/views')).toBe('/views');
        expect(routeLabel('/mcp')).toBe('/mcp');
    });

    it('never lets a path grow the set of labels', () => {
        expect(routeLabel('/api/random-1234')).toBe('other');
        expect(routeLabel('/.well-known/api-catalog')).toBe('/.well-known');
    });
});

describe('clientKind', () => {
    it.each([
        ['Mozilla/5.0 (Macintosh) AppleWebKit/605 Safari/605', 'browser'],
        ['Mozilla/5.0 (compatible; GPTBot/1.1)', 'agent'],
        ['ClaudeBot/1.0', 'agent'],
        ['curl/8.7.1', 'agent'],
        ['', 'other'],
        [null, 'other'],
    ])('%s is %s', (userAgent, expected) => {
        expect(clientKind(userAgent)).toBe(expected);
    });
});

describe('data points', () => {
    it('records a request as route, method, colo, client, status and milliseconds', () => {
        const env = { METRICS: metrics() };
        recordRequest(env, {
            route: '/views',
            method: 'GET',
            status: 200,
            ms: 12.6,
            colo: 'ORD',
            client: 'browser',
        });
        expect(env.METRICS.writeDataPoint).toHaveBeenCalledWith({
            indexes: ['/views'],
            blobs: ['request', 'GET', 'ORD', 'browser'],
            doubles: [200, 13],
        });
    });

    it('records a tool call as ok or error', () => {
        const env = { METRICS: metrics() };
        recordTool(env, { tool: 'get_project', ok: false, ms: 4 });
        expect(env.METRICS.writeDataPoint).toHaveBeenCalledWith({
            indexes: ['get_project'],
            blobs: ['tool', 'error'],
            doubles: [0, 4],
        });
    });

    it('does nothing without the binding, and swallows a binding that throws', () => {
        expect(() =>
            recordRequest({}, { route: '/x', method: 'GET', status: 200, ms: 1 })
        ).not.toThrow();
        const env = {
            METRICS: {
                writeDataPoint: () => {
                    throw new Error('quota');
                },
            },
        };
        expect(() => recordTool(env, { tool: 't', ok: true, ms: 1 })).not.toThrow();
    });
});

describe('spans', () => {
    it('runs the task directly when there is no tracing', () => {
        expect(withSpan(undefined, 'x', () => 7)).toBe(7);
        expect(() => nameRootSpan({}, 'GET', '/x')).not.toThrow();
    });

    it('runs the task inside a span, and renames the root span, when there is', () => {
        const updateName = vi.fn();
        const ctx = {
            tracing: {
                enterSpan: vi.fn((name, task) => task()),
                getActiveSpan: () => ({ updateName }),
            },
        };
        expect(withSpan(ctx, 'github', () => 'ok')).toBe('ok');
        expect(ctx.tracing.enterSpan).toHaveBeenCalledWith('github', expect.any(Function));
        nameRootSpan(ctx, 'GET', '/views');
        expect(updateName).toHaveBeenCalledWith('GET /views');
    });
});

describe('the Worker', () => {
    it('adds Server-Timing and records one request, with no address or user agent in it', async () => {
        const env = { METRICS: metrics() };
        const response = await worker.fetch(
            get('/api/health', {
                'User-Agent': 'Mozilla/5.0 Secret-Build',
                'CF-Connecting-IP': '203.0.113.9',
            }),
            env,
            {}
        );
        expect(response.status).toBe(200);
        expect(response.headers.get('Server-Timing')).toMatch(/^worker;dur=\d+$/);

        expect(env.METRICS.writeDataPoint).toHaveBeenCalledTimes(1);
        const point = env.METRICS.writeDataPoint.mock.calls[0][0];
        expect(point.indexes).toEqual(['/health']);
        expect(point.blobs).toEqual(['request', 'GET', 'unknown', 'browser']);
        expect(JSON.stringify(point)).not.toMatch(/203\.0\.113|Secret-Build/);
    });

    it('keeps a streamed body intact when it adds the header', async () => {
        const handleMcp = await import('../../worker/mcp.js');
        const spy = vi.spyOn(handleMcp, 'handleMcp').mockImplementation(() => {
            const body = new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode('data: one\n\n'));
                    controller.enqueue(new TextEncoder().encode('data: two\n\n'));
                    controller.close();
                },
            });
            return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
        });
        const response = await worker.fetch(get('/mcp'), {}, {});
        expect(response.headers.get('Content-Type')).toBe('text/event-stream');
        expect(response.headers.get('Server-Timing')).toBeTruthy();
        expect(await response.text()).toBe('data: one\n\ndata: two\n\n');
        spy.mockRestore();
    });

    it('still answers when the metrics binding fails', async () => {
        const env = {
            METRICS: {
                writeDataPoint: () => {
                    throw new Error('quota');
                },
            },
        };
        expect((await worker.fetch(get('/health'), env, {})).status).toBe(200);
    });
});

describe('wrangler.toml', () => {
    const toml = readFileSync(join(import.meta.dirname, '../../wrangler.toml'), 'utf8');

    it('declares the bindings the code reads', () => {
        expect(toml).toMatch(/binding = "METRICS"/);
        expect(toml).toMatch(/dataset = "portfolio_metrics"/);
        expect(toml).toMatch(/binding = "CF_VERSION"/);
        expect(toml).toMatch(/\[observability\.traces\]\s+enabled = true/);
    });
});
