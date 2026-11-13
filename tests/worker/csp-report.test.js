/**
 * POST /csp-report: reading both report formats, keeping three short strings and nothing else,
 * and giving a hostile sender nothing to learn. The metrics binding is a spy.
 */
import { describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index.js';
import {
    blockedSource,
    directiveName,
    handleCspReport,
    pageOf,
    parseReports,
} from '../../worker/csp-report.js';

const legacy = (overrides = {}) =>
    JSON.stringify({
        'csp-report': {
            'document-uri': 'https://andernet.dev/status/?secret=1#frag',
            'blocked-uri': 'https://evil.example/path/x.js?token=abc',
            'effective-directive': 'script-src-elem',
            'violated-directive': 'script-src-elem',
            ...overrides,
        },
    });

const modern = (...bodies) =>
    JSON.stringify(
        bodies.map(body => ({ type: 'csp-violation', url: 'https://andernet.dev/', body }))
    );

const post = (body, headers = {}) =>
    new Request('https://andernet.dev/api/csp-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report', ...headers },
        body,
    });

const points = METRICS => METRICS.writeDataPoint.mock.calls.map(([point]) => point);
const envWithMetrics = (extra = {}) => ({ METRICS: { writeDataPoint: vi.fn() }, ...extra });

describe('reading the parts', () => {
    it('directiveName keeps only the directives the policy has', () => {
        expect(directiveName('script-src-elem')).toBe('script-src-elem');
        expect(directiveName("script-src 'self' https://x.dev")).toBe('script-src');
        expect(directiveName('SCRIPT-SRC')).toBe('script-src');
        // A name from the sender would be unbounded
        for (const bad of ['', undefined, 'made-up-directive-' + 'x'.repeat(500), '<script>']) {
            expect(directiveName(bad)).toBe('other');
        }
    });

    it('blockedSource reduces an address to a host or a keyword, never a path or a query', () => {
        expect(blockedSource('https://evil.example/path/x.js?token=abc')).toBe('evil.example');
        expect(blockedSource('HTTPS://CDN.Example.COM')).toBe('cdn.example.com');
        expect(blockedSource('inline')).toBe('inline');
        expect(blockedSource('eval')).toBe('eval');
        expect(blockedSource('data:image/png;base64,AAAA')).toBe('data');
        expect(blockedSource('blob:https://andernet.dev/1234')).toBe('blob');
        expect(blockedSource('')).toBe('unknown');
        expect(blockedSource('not a url at all')).toBe('other');
        expect(blockedSource(`https://${'a'.repeat(300)}.example`).length).toBeLessThanOrEqual(100);
    });

    it('pageOf drops the query and the fragment, and caps the path', () => {
        expect(pageOf('https://andernet.dev/status/?secret=1#frag')).toEqual({
            host: 'andernet.dev',
            path: '/status/',
        });
        expect(pageOf(`https://andernet.dev/${'p'.repeat(400)}`).path.length).toBeLessThanOrEqual(
            100
        );
        expect(pageOf('garbage')).toEqual({ host: '', path: '' });
        expect(pageOf(undefined)).toEqual({ host: '', path: '' });
    });

    it('parseReports reads the legacy report-uri format', () => {
        expect(parseReports(legacy())).toEqual([
            {
                documentUrl: 'https://andernet.dev/status/?secret=1#frag',
                blockedUrl: 'https://evil.example/path/x.js?token=abc',
                directive: 'script-src-elem',
            },
        ]);
    });

    it('parseReports reads the Reporting API format, and skips other report types', () => {
        const raw = JSON.stringify([
            { type: 'deprecation', body: { id: 'x' } },
            {
                type: 'csp-violation',
                url: 'https://andernet.dev/',
                body: { blockedURL: 'inline', effectiveDirective: 'style-src-elem' },
            },
        ]);
        expect(parseReports(raw)).toEqual([
            {
                documentUrl: 'https://andernet.dev/',
                blockedUrl: 'inline',
                directive: 'style-src-elem',
            },
        ]);
    });

    it('parseReports gives nothing for junk, and at most five for a flood', () => {
        for (const junk of ['', 'not json', 'null', '42', '{}', '[]', '{"csp-report":null}']) {
            expect(parseReports(junk), junk).toEqual([]);
        }
        const many = modern(...Array.from({ length: 50 }, () => ({ blockedURL: 'inline' })));
        expect(parseReports(many)).toHaveLength(5);
    });
});

describe('POST /api/csp-report', () => {
    it('records one data point per report: a directive, a host and a path, nothing else', async () => {
        const env = envWithMetrics();
        const response = await handleCspReport(post(legacy()), env);
        expect(response.status).toBe(204);
        expect(points(env.METRICS)).toEqual([
            {
                indexes: ['script-src-elem'],
                blobs: ['csp', 'evil.example', '/status/'],
                doubles: [1],
            },
        ]);
        // No query string, token, address or user agent anywhere in what was stored
        expect(JSON.stringify(points(env.METRICS))).not.toMatch(
            /secret|token|frag|203\.0\.113|Mozilla/
        );
    });

    it('records each report in a batch', async () => {
        const env = envWithMetrics();
        const body = modern(
            {
                documentURL: 'https://andernet.dev/',
                blockedURL: 'inline',
                effectiveDirective: 'script-src-elem',
            },
            {
                documentURL: 'https://andernet.dev/posts/x/',
                blockedURL: 'https://a.example/',
                effectiveDirective: 'img-src',
            }
        );
        await handleCspReport(post(body, { 'Content-Type': 'application/reports+json' }), env);
        expect(points(env.METRICS).map(point => point.indexes[0])).toEqual([
            'script-src-elem',
            'img-src',
        ]);
    });

    it("ignores a report about any other site (it cannot inflate this one's numbers)", async () => {
        const env = envWithMetrics();
        await handleCspReport(post(legacy({ 'document-uri': 'https://other.example/' })), env);
        await handleCspReport(
            post(legacy({ 'document-uri': 'https://andernet.dev.evil.example/' })),
            env
        );
        await handleCspReport(post(legacy({ 'document-uri': 'nonsense' })), env);
        expect(env.METRICS.writeDataPoint).not.toHaveBeenCalled();
    });

    it('answers 204 to everything, so a sender learns nothing from the reply', async () => {
        const env = envWithMetrics();
        for (const body of [legacy(), 'not json', '', '[]', 'x'.repeat(20_000)]) {
            const response = await handleCspReport(post(body), env);
            expect(response.status).toBe(204);
            expect(await response.text()).toBe('');
        }
    });

    it('refuses a body over 8 KB without recording it, by its declared size or by reading it', async () => {
        const env = envWithMetrics();
        const big = legacy({ 'original-policy': 'x'.repeat(9000) });
        await handleCspReport(post(big, { 'Content-Length': String(big.length) }), env);
        // No declared size: the reader stops at the cap
        const undeclared = new Request('https://andernet.dev/api/csp-report', {
            method: 'POST',
            duplex: 'half',
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode(big));
                    controller.close();
                },
            }),
        });
        expect((await handleCspReport(undeclared, env)).status).toBe(204);
        expect(env.METRICS.writeDataPoint).not.toHaveBeenCalled();
    });

    it('is limited per address, and a limited sender still gets a 204', async () => {
        const limit = vi.fn(async () => ({ success: false }));
        const env = envWithMetrics({ CSP_LIMITER: { limit } });
        const response = await handleCspReport(
            post(legacy(), { 'CF-Connecting-IP': '198.51.100.7' }),
            env
        );
        expect(response.status).toBe(204);
        expect(limit).toHaveBeenCalledWith({ key: 'csp:198.51.100.7' });
        expect(env.METRICS.writeDataPoint).not.toHaveBeenCalled();
    });

    it('answers a GET with 405 and says what it takes', async () => {
        const response = await handleCspReport(
            new Request('https://andernet.dev/api/csp-report'),
            {}
        );
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('POST');
    });

    it('does not break without the metrics binding (local development)', async () => {
        expect((await handleCspReport(post(legacy()), {})).status).toBe(204);
    });
});

describe('through the Worker', () => {
    it('is routed at /api/csp-report and at the workers.dev address', async () => {
        for (const path of ['/api/csp-report', '/csp-report']) {
            const env = envWithMetrics();
            const response = await worker.fetch(
                new Request(`https://andernet.dev${path}`, { method: 'POST', body: legacy() }),
                env,
                {}
            );
            expect(response.status, path).toBe(204);
        }
    });

    // The report is recorded on its own; the request that carried it would add a location and a
    // browser/agent guess to a data point about nothing
    it('writes only the report, not a data point about the request that carried it', async () => {
        const env = envWithMetrics();
        await worker.fetch(
            new Request('https://andernet.dev/api/csp-report', { method: 'POST', body: legacy() }),
            env,
            {}
        );
        expect(points(env.METRICS)).toHaveLength(1);
        expect(points(env.METRICS)[0].blobs[0]).toBe('csp');
    });
});
