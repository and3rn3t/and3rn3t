import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    VITALS,
    dayReadout,
    dayState,
    formatMs,
    formatPercent,
    formatUptime,
    formatVital,
    loadStatus,
    parseTime,
    rateVital,
    relativeTime,
    renderStatus,
    stripCells,
    uptimeTotals,
    verdict,
} from '../../modules/status-page.js';
import { renderStatusPage } from '../../scripts/templates/status-page.mjs';

const NOW = new Date('2026-11-13T00:40:00Z');

describe('formatting', () => {
    it('formatMs says "<1 ms" for 0 (a Worker\'s clock only moves while it waits), and seconds from 1000', () => {
        expect(formatMs(0)).toBe('<1 ms');
        expect(formatMs(247)).toBe('247 ms');
        expect(formatMs(2363)).toBe('2.4 s');
        expect(formatMs(null)).toBe('—');
        expect(formatMs(undefined)).toBe('—');
    });

    it('formatPercent keeps small shares readable and a measured 0 as 0%', () => {
        expect(formatPercent(0)).toBe('0%');
        expect(formatPercent(0.0042)).toBe('0.42%');
        expect(formatPercent(0.216)).toBe('22%');
        expect(formatPercent(null)).toBe('—');
    });

    it('formatUptime never rounds up to 100% while a check has failed', () => {
        expect(formatUptime(288, 288)).toBe('100%');
        expect(formatUptime(287, 288)).toBe('99.65%');
        expect(formatUptime(99999, 100000)).toBe('99.99%');
        expect(formatUptime(0, 0)).toBe('—');
    });

    it("parseTime reads the API's UTC time with no zone, and an ISO string", () => {
        expect(parseTime('2026-11-13 00:30:54').toISOString()).toBe('2026-11-13T00:30:54.000Z');
        expect(parseTime('2026-11-13T00:30:54Z').toISOString()).toBe('2026-11-13T00:30:54.000Z');
        expect(parseTime('not a time')).toBeNull();
        expect(parseTime(null)).toBeNull();
    });

    it('relativeTime is plain English', () => {
        const at = seconds => new Date(NOW.getTime() - seconds * 1000);
        expect(relativeTime(at(10), NOW)).toBe('just now');
        expect(relativeTime(at(180), NOW)).toBe('3 minutes ago');
        expect(relativeTime(at(60), NOW)).toBe('1 minute ago');
        expect(relativeTime(at(3 * 3600), NOW)).toBe('3 hours ago');
        expect(relativeTime(null, NOW)).toBe('—');
    });
});

describe('verdict', () => {
    const uptime = (ok, at = '2026-11-13 00:35:00') => ({
        lastProbe: { at, ok },
        days: [{ day: '2026-11-13', probes: 100, ok: 99 }],
    });

    it('is up when the last check passed, and says so with the share that passed', () => {
        expect(verdict(uptime(true), NOW)).toMatchObject({
            state: 'up',
            label: 'Responding',
            detail: expect.stringContaining('99.00% of checks passed'),
        });
    });

    it('is down when the last check failed', () => {
        expect(verdict(uptime(false), NOW)).toMatchObject({
            state: 'down',
            label: 'Not responding',
        });
    });

    // Silence is not the same as being up
    it('is "no recent check" when the checks themselves have stopped', () => {
        expect(verdict(uptime(true, '2026-11-12 22:00:00'), NOW)).toMatchObject({
            state: 'stale',
            label: 'No recent check',
        });
    });

    it('keeps saying "no recent check" for a long outage, as long as there is history', () => {
        expect(verdict(uptime(true, '2026-10-20 08:00:00'), NOW).state).toBe('stale');
    });

    // An older Worker reported only when the last check ran, not whether it passed
    it("uses the older Worker's timestamp for freshness without assuming success", () => {
        const legacy = { lastProbeAt: '2026-11-13 00:35:00', days: uptime(true).days };
        expect(verdict(legacy, NOW)).toMatchObject({
            state: 'unknown',
            label: 'Checks are running',
            detail: expect.stringContaining('result is not available yet'),
        });
        expect(verdict({ ...legacy, lastProbeAt: '2026-11-12 22:00:00' }, NOW).state).toBe('stale');
    });

    it('says the latest check is unavailable, not that there are none, when history exists', () => {
        expect(verdict({ lastProbe: null, days: uptime(true).days }, NOW)).toMatchObject({
            state: 'unknown',
            label: 'Latest check unavailable',
        });
    });

    it('is "no checks recorded yet" only with no history at all', () => {
        expect(verdict(null, NOW).label).toBe('No checks recorded yet');
        expect(verdict({ lastProbe: null, days: [] }, NOW).label).toBe('No checks recorded yet');
    });
});

describe('the uptime strip', () => {
    const days = [
        { day: '2026-11-11', probes: 288, ok: 288 },
        { day: '2026-11-12', probes: 288, ok: 280 },
        { day: '2026-11-13', probes: 10, ok: 0 },
    ];

    it('dayState tells all, some and none apart, and no data', () => {
        expect(dayState(days[0])).toBe('ok');
        expect(dayState(days[1])).toBe('partial');
        expect(dayState(days[2])).toBe('down');
        expect(dayState(null)).toBe('none');
        expect(dayState({ day: 'x', probes: 0, ok: 0 })).toBe('none');
    });

    it('stripCells is one cell per calendar day ending today, with measurements on their own dates', () => {
        const cells = stripCells(days, 5, NOW);
        expect(cells.map(cell => cell.day)).toEqual([
            '2026-11-09',
            '2026-11-10',
            '2026-11-11',
            '2026-11-12',
            '2026-11-13',
        ]);
        expect(cells.slice(2)).toEqual(days);
        expect(cells.slice(0, 2).every(cell => cell.probes === 0)).toBe(true);
    });

    it('leaves a gap where a day had no checks, instead of closing it up', () => {
        const cells = stripCells([days[0], days[2]], 3, NOW); // nothing on Nov 12
        expect(cells.map(dayState)).toEqual(['ok', 'none', 'down']);
        expect(cells[1].day).toBe('2026-11-12');
    });

    it('shows a stopped probe as empty cells at the right, not the last recorded day at the edge', () => {
        const cells = stripCells([days[0]], 4, NOW); // last check Nov 11; it is Nov 13
        expect(cells.map(dayState)).toEqual(['none', 'ok', 'none', 'none']);
        expect(cells.at(-1).day).toBe('2026-11-13');
    });

    it('follows the reference date it is given, not the clock', () => {
        const later = new Date('2026-12-01T10:00:00Z');
        expect(stripCells(days, 2, later).map(cell => cell.day)).toEqual([
            '2026-11-30',
            '2026-12-01',
        ]);
        expect(stripCells(undefined, 2, later)).toHaveLength(2);
    });

    it('dayReadout names the day and the share, and says so when there were no checks', () => {
        expect(dayReadout(days[1])).toBe('Thu, Nov 12: 280 of 288 checks passed (97.22%).');
        expect(dayReadout({ day: '2026-11-12', probes: 0, ok: 0 })).toBe(
            'Thu, Nov 12: no checks recorded.'
        );
        expect(dayReadout(null)).toBe('No data for this day.');
    });

    it('uptimeTotals adds the days up', () => {
        expect(uptimeTotals(days)).toEqual({ probes: 586, ok: 568 });
    });
});

describe('vitals', () => {
    it('rateVital is good up to the limit and over after it, and the bar never passes full', () => {
        expect(rateVital(440, 2500)).toEqual({ rating: 'good', fill: 17.6 });
        expect(rateVital(2500, 2500)).toEqual({ rating: 'good', fill: 100 });
        expect(rateVital(5000, 2500)).toEqual({ rating: 'over', fill: 100 });
    });

    it('formatVital shows milliseconds for times and the bare number for layout shift', () => {
        expect(formatVital(VITALS[0], 440)).toBe('440 ms');
        expect(formatVital(VITALS[2], 0.012)).toBe('0.012');
        expect(formatVital(VITALS[1], null)).toBe('—');
    });

    it('uses the published "good" limits', () => {
        expect(Object.fromEntries(VITALS.map(vital => [vital.key, vital.limit]))).toEqual({
            lcpMs: 2500,
            inpMs: 200,
            cls: 0.1,
            ttfbMs: 800,
        });
    });
});

describe('rendering', () => {
    const full = {
        generatedAt: '2026-11-13T00:38:00Z',
        api: {
            last24h: { errorRate: 0, p50Ms: 0, p95Ms: 2363 },
            last7d: { errorRate: 0.0042, p50Ms: 0, p95Ms: 1800 },
        },
        mcp: [{ tool: 'get_project', calls: 5, errors: 1 }],
        clients: { agentShare: 0.216 },
        uptime: {
            lastProbe: { at: '2026-11-13 00:35:00', ok: true },
            days: [{ day: '2026-11-13', probes: 40, ok: 40 }],
        },
        vitals: { lcpMs: 440, inpMs: null, cls: 0, ttfbMs: 247 },
        crawlers: [{ category: 'AI Assistant', requests: 532 }],
        edge: { answeredAtEdge: 0.536 },
    };
    const nothing = {
        api: { last24h: null, last7d: null },
        mcp: null,
        clients: null,
        uptime: null,
        vitals: null,
        crawlers: null,
        edge: null,
    };
    let root;
    const text = selector => root.querySelector(selector).textContent.trim();

    beforeEach(() => {
        // The page's own markup, so the selectors the module uses are the ones the template draws
        document.body.innerHTML = renderStatusPage().match(/<body>([\s\S]*)<\/body>/)[1];
        root = document.querySelector('[data-status-root]');
    });

    it('draws every section from a full answer', () => {
        renderStatus(root, full, NOW);
        expect(text('[data-verdict-label]')).toBe('Responding');
        expect(root.querySelector('[data-verdict]').dataset.state).toBe('up');
        expect(text('[data-stat="error-24h"]')).toBe('0%');
        expect(text('[data-stat="error-7d"]')).toBe('Last 7 days: 0.42%');
        expect(text('[data-stat="p50-24h"]')).toBe('<1 ms');
        expect(text('[data-stat="p95-24h"]')).toBe('2.4 s');
        expect(text('[data-stat="agent-share"]')).toBe('22%');
        expect(root.querySelectorAll('[data-vitals] .meter')).toHaveLength(4);
        expect(text('[data-rank="crawlers"]')).toContain('AI Assistant');
        expect(text('[data-rank="tools"]')).toContain('get_project');
        expect(text('[data-rank="tools"]')).toContain('1 failed');
        expect(text('[data-updated]')).toContain('Updated 2 minutes ago');
        expect(root.querySelectorAll('.uptime__day')).toHaveLength(90);
        expect(root.querySelectorAll('.uptime__day--ok')).toHaveLength(1);
        expect(text('[data-table="uptime"]')).toContain('Fri, Nov 13');
    });

    it('shows a measured zero as 0% but a missing section as a dash, never a zero', () => {
        renderStatus(root, nothing, NOW);
        expect(text('[data-stat="error-24h"]')).toBe('—');
        expect(text('[data-stat="p95-24h"]')).toBe('—');
        expect(text('[data-stat="agent-share"]')).toBe('—');
        expect(text('[data-verdict-label]')).toBe('No checks recorded yet');
        expect(text('[data-rank="crawlers"]')).toBe('Not available right now.');
        expect(text('[data-rank="tools"]')).toBe('Not available right now.');
        expect(text('[data-table="uptime"]')).toBe('No checks recorded yet.');
    });

    it('says "not available yet" for a vital with no figure, and rates one that has it', () => {
        renderStatus(root, full, NOW);
        const rows = [...root.querySelectorAll('[data-vitals] .meter')];
        expect(rows[0].textContent).toContain('440 ms');
        expect(rows[0].textContent).toContain('Good (limit 2.5 s)');
        expect(rows[1].textContent).toContain('Not available yet');
        expect(rows[1].textContent).not.toContain('visits');
        expect(rows[1].textContent).not.toContain('Good');

        renderStatus(root, { ...full, vitals: { ...full.vitals, lcpMs: 4000 } }, NOW);
        const over = root.querySelector('[data-vitals] .meter');
        expect(over.dataset.rating).toBe('over');
        expect(over.textContent).toContain('Needs work');
    });

    // The Worker sends [] when a query worked and found none, and null when it could not be read
    it('says "none" for an empty list and "not available" for a missing one', () => {
        renderStatus(root, { ...full, crawlers: [], mcp: [] }, NOW);
        expect(text('[data-rank="crawlers"]')).toBe(
            'No verified crawler traffic in the last 7 days.'
        );
        expect(text('[data-rank="tools"]')).toBe('No MCP tool calls in the last 7 days.');

        renderStatus(root, { ...full, crawlers: null, mcp: undefined }, NOW);
        expect(text('[data-rank="crawlers"]')).toBe('Not available right now.');
        expect(text('[data-rank="tools"]')).toBe('Not available right now.');
    });

    it("reads an older Worker's answer (a time, no outcome) without claiming success", () => {
        const legacy = {
            ...full,
            uptime: { lastProbeAt: '2026-11-13 00:35:00', days: full.uptime.days },
        };
        renderStatus(root, legacy, NOW);
        expect(text('[data-verdict-label]')).toBe('Checks are running');
        expect(text('[data-uptime-readout]')).not.toContain('No checks recorded yet');
    });

    it('writes values as text: a hostile tool name does not become markup', () => {
        renderStatus(
            root,
            { ...full, mcp: [{ tool: '<img src=x onerror=alert(1)>', calls: 1, errors: 0 }] },
            NOW
        );
        expect(root.querySelector('[data-rank="tools"] img')).toBeNull();
        expect(text('[data-rank="tools"]')).toContain('<img src=x');
    });

    it('draws again over what is there, without stacking rows', () => {
        renderStatus(root, full, NOW);
        renderStatus(root, full, NOW);
        expect(root.querySelectorAll('[data-vitals] .meter')).toHaveLength(4);
        expect(root.querySelectorAll('[data-rank="crawlers"] .rank__row')).toHaveLength(1);
    });
});

describe('refreshing', () => {
    let root;
    const now = new Date();
    const good = () =>
        new Response(
            JSON.stringify({
                generatedAt: now.toISOString(),
                api: { last24h: { errorRate: 0.01, p50Ms: 3, p95Ms: 40 }, last7d: null },
                mcp: [],
                clients: { agentShare: 0.2 },
                uptime: {
                    lastProbe: { at: now.toISOString(), ok: true },
                    days: [{ day: now.toISOString().slice(0, 10), probes: 4, ok: 4 }],
                },
                vitals: { lcpMs: 440, inpMs: null, cls: 0, ttfbMs: 247 },
                crawlers: [],
                edge: { answeredAtEdge: 0.5 },
            }),
            { status: 200 }
        );

    beforeEach(() => {
        document.body.innerHTML = renderStatusPage().match(/<body>([\s\S]*)<\/body>/)[1];
        root = document.querySelector('[data-status-root]');
    });
    afterEach(() => vi.unstubAllGlobals());

    const label = () => root.querySelector('[data-verdict-label]').textContent;

    it('replaces an old "Responding" with the unavailable state when a refresh fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(good()));
        await loadStatus(root);
        expect(label()).toBe('Responding');
        expect(root.querySelector('[data-stat="error-24h"]').textContent).toBe('1%');

        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
        await loadStatus(root);
        expect(label()).toBe('Numbers unavailable');
        expect(root.querySelector('[data-verdict]').dataset.state).toBe('unknown');
        // Nothing from the earlier answer is left standing behind it
        expect(root.querySelector('[data-stat="error-24h"]').textContent).toBe('—');
        expect(root.querySelector('[data-stat="agent-share"]').textContent).toBe('—');
        expect(root.querySelector('[data-uptime-readout]').textContent).toBe(
            'No checks recorded yet.'
        );
        expect(root.querySelector('[data-updated]').textContent).toContain('Could not update');
    });

    it('also does so when the request itself fails, and recovers on the next good answer', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
        await loadStatus(root);
        expect(label()).toBe('Numbers unavailable');

        vi.stubGlobal(
            'fetch',
            vi.fn().mockImplementation(async () => good())
        );
        await loadStatus(root);
        expect(label()).toBe('Responding');
    });
});

describe('the page', () => {
    const html = renderStatusPage();

    // Parsed, not pattern-matched: it is the browser's own view of the page that matters
    it('has no inline script of its own (the CSP lists inline scripts by hash)', () => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const inline = doc.querySelectorAll('script:not([src]):not([type="application/ld+json"])');
        // The theme script in the shared head is the only one, as on every generated page
        expect(inline).toHaveLength(1);
    });

    it('is indexable, has its own canonical address, and loads its stylesheet and module', () => {
        expect(html).toContain('<link rel="canonical" href="https://andernet.dev/status/" />');
        expect(html).not.toContain('noindex');
        expect(html).toContain('href="/styles/status.css"');
        expect(html).toContain('src="/modules/status-page.js"');
    });

    it('says plainly that it is aggregates, and links the JSON', () => {
        expect(html).toContain('not who visits it');
        expect(html).toContain('href="/api/stats"');
    });

    it('promises nothing it does not publish: no visitor counts, no locations', () => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        for (const script of doc.querySelectorAll('script')) script.remove();
        expect(doc.body.textContent).not.toMatch(
            /visitors? (today|this week)|unique visitors|page views|countries/i
        );
    });
});
