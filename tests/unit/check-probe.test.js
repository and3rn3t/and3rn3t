import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
    MAX_AGE_MINUTES,
    check,
    evaluateProbe,
    fetchStats,
    parseUtc,
} from '../../scripts/check-probe.mjs';

const NOW = new Date('2026-11-13T12:00:00Z');
const minutesAgo = minutes =>
    new Date(NOW.getTime() - minutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const stats = (lastProbe, extra = {}) => ({ uptime: { lastProbe, days: [], ...extra } });

describe('parseUtc', () => {
    it("reads the Worker's UTC time with no zone, and an ISO string", () => {
        expect(parseUtc('2026-11-13 00:30:54').toISOString()).toBe('2026-11-13T00:30:54.000Z');
        expect(parseUtc('2026-11-13T00:30:54Z').toISOString()).toBe('2026-11-13T00:30:54.000Z');
        expect(parseUtc('2026-11-13T00:30:54+02:00').toISOString()).toBe(
            '2026-11-12T22:30:54.000Z'
        );
    });

    it('is null for anything else', () => {
        for (const bad of ['', 'yesterday', null, undefined, 5, {}]) {
            expect(parseUtc(bad), String(bad)).toBeNull();
        }
    });
});

describe('evaluateProbe', () => {
    it('has no problems when the last check was recent and passed', () => {
        const result = evaluateProbe(stats({ at: minutesAgo(3), ok: true }), NOW);
        expect(result.problems).toEqual([]);
        expect(result.summary).toBe('last check 3 minutes ago, passed');
    });

    it('allows a check as old as the limit, and no older', () => {
        expect(
            evaluateProbe(stats({ at: minutesAgo(MAX_AGE_MINUTES), ok: true }), NOW).problems
        ).toEqual([]);
        const late = evaluateProbe(stats({ at: minutesAgo(MAX_AGE_MINUTES + 1), ok: true }), NOW);
        expect(late.problems).toEqual([expect.stringContaining('the probe has stopped')]);
    });

    // The silent probe is the case Cloudflare's monitors cannot see: no rows, no signal
    it('fails when the probe has been quiet for hours, naming how long', () => {
        const result = evaluateProbe(stats({ at: minutesAgo(180), ok: true }), NOW);
        expect(result.problems).toEqual([expect.stringMatching(/180 minutes ago .* has stopped/)]);
    });

    it('fails when the last check failed, even a fresh one', () => {
        const result = evaluateProbe(stats({ at: minutesAgo(2), ok: false }), NOW);
        expect(result.problems).toEqual(['the last check failed: the site did not answer it']);
        expect(result.summary).toContain('FAILED');
    });

    it('fails when it is both old and failed, with both reasons', () => {
        expect(evaluateProbe(stats({ at: minutesAgo(90), ok: false }), NOW).problems).toHaveLength(
            2
        );
    });

    it("does not take an older Worker's answer (a time with no outcome) as a pass", () => {
        const result = evaluateProbe(stats({ at: minutesAgo(1) }), NOW);
        expect(result.problems).toEqual(['the Worker did not say whether the last check passed']);
    });

    it('fails when there is no last check at all, or no uptime section', () => {
        expect(evaluateProbe(stats(null), NOW).problems[0]).toContain('no check has been recorded');
        expect(evaluateProbe({ uptime: null }, NOW).problems[0]).toContain('no uptime section');
        for (const nothing of [null, undefined, {}]) {
            expect(evaluateProbe(nothing, NOW).problems, String(nothing)).toHaveLength(1);
        }
    });

    it('fails on a time it cannot read rather than treating it as fresh', () => {
        const result = evaluateProbe(stats({ at: 'garbage', ok: true }), NOW);
        expect(result.problems).toEqual([expect.stringContaining('cannot be read')]);
    });
});

describe('fetchStats and check', () => {
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
    const noWait = () => Promise.resolve();

    it('asks /api/stats on the given site, without a double slash', async () => {
        const fetchImpl = vi.fn(async () => reply(stats({ at: minutesAgo(1), ok: true })));
        await check('https://andernet.dev', { fetchImpl, now: NOW, wait: noWait });
        expect(fetchImpl.mock.calls[0][0]).toBe('https://andernet.dev/api/stats');
    });

    it('tries once more after a failure, and succeeds if the second try does', async () => {
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(new Response('{}', { status: 502 }))
            .mockResolvedValueOnce(reply(stats({ at: minutesAgo(1), ok: true })));
        const result = await check('https://x.dev', { fetchImpl, now: NOW, wait: noWait });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.problems).toEqual([]);
    });

    it('reports an API that does not answer as the problem, after two tries', async () => {
        const fetchImpl = vi.fn(async () => new Response('{}', { status: 503 }));
        const result = await check('https://x.dev', { fetchImpl, now: NOW, wait: noWait });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(result.problems).toEqual([
            expect.stringContaining(
                'could not read https://x.dev/api/stats: /api/stats answered HTTP 503'
            ),
        ]);
    });

    it('reports a network error the same way, and not as an all-clear', async () => {
        const fetchImpl = vi.fn(async () => Promise.reject(new Error('connection reset')));
        const result = await check('https://x.dev', { fetchImpl, now: NOW, wait: noWait });
        expect(result.problems[0]).toContain('connection reset');
    });

    it('fetchStats gives the parsed answer', async () => {
        const body = stats({ at: minutesAgo(1), ok: true });
        expect(await fetchStats('https://x.dev', async () => reply(body), noWait)).toEqual(body);
    });
});

describe('the daily workflow (site-check.yml)', () => {
    const workflow = readFileSync(
        join(import.meta.dirname, '../../.github/workflows/site-check.yml'),
        'utf8'
    );
    const job = workflow.slice(workflow.indexOf('  uptime-probe:'));

    it('runs the script against the live site', () => {
        expect(job).toContain('node scripts/check-probe.mjs https://andernet.dev');
        expect(job).toContain('sparse-checkout: scripts/check-probe.mjs');
    });

    // The failure is the alert: a job that cannot fail would be a check that says nothing
    it('can fail: it is not report-only', () => {
        expect(job).not.toMatch(/continue-on-error/);
        expect(job).not.toMatch(/\|\|\s*true/);
    });

    it('is its own job, so the other checks do not hide a failure', () => {
        expect(job).toMatch(/^ {2}uptime-probe:\n {4}runs-on: /);
    });
});
