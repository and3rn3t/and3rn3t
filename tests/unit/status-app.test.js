/**
 * The status panel that show_status draws inside Claude (worker/mcp-app-status.js): its drawing
 * code run against sample data, the way the iframe runs it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { STATUS_RENDER_SOURCE, STATUS_VIEW_HTML } from '../../worker/mcp-app-status.js';
import { dayState, formatMs, formatPercent, formatUptime } from '../../modules/status-page.js';

const renderStatus = new Function(`${STATUS_RENDER_SOURCE}; return renderStatus;`)();

/** What /api/stats returned live on 2026-11-15, trimmed. */
const stats = {
    generatedAt: '2026-11-15T01:25:02.068Z',
    api: { last24h: { errorRate: 0, p50Ms: 25, p95Ms: 2257 }, last7d: null },
    mcp: [
        { tool: 'list_posts', calls: 8, errors: 0 },
        { tool: 'get_project', calls: 6, errors: 3 },
        { tool: 'get_profile', calls: 1, errors: 0 },
    ],
    uptime: {
        lastProbe: { at: '2026-11-15 01:20:53', ok: true },
        days: [
            { day: '2026-11-13', probes: 281, ok: 281 },
            { day: '2026-11-14', probes: 288, ok: 280 },
            { day: '2026-11-15', probes: 17, ok: 17 },
        ],
    },
    vitals: { lcpMs: 408, inpMs: null, cls: 0, ttfbMs: 1400 },
};

const draw = data => {
    renderStatus(data, document);
    return document.getElementById('root');
};
const text = root => root.textContent.replaceAll(/\s+/g, ' ');

beforeEach(() => {
    document.body.innerHTML = '<div id="root"><p>Loading</p></div>';
});

describe('renderStatus', () => {
    it('says the site is answering, with the share of checks that passed', () => {
        const root = draw(stats);
        expect(root.querySelector('.headline--ok').textContent).toBe('andernet.dev is answering');
        expect(text(root)).toContain('Last check 2026-11-15 01:20 UTC');
        expect(text(root)).toContain('98.63% of 586 checks passed over 3 days');
    });

    it('draws one cell a day, coloured by how many checks passed', () => {
        const cells = [...draw(stats).querySelectorAll('.cell')];
        expect(cells.map(cell => cell.className)).toEqual([
            'cell cell--ok',
            'cell cell--warn', // 280 of 288 passed: some failed, not all ("partial" on /status/)
            'cell cell--ok',
        ]);
        expect(cells[1].title).toBe('2026-11-14: 97.2%');
    });

    it('shows the numbers, with a dash for one that could not be measured', () => {
        const shown = Object.fromEntries(
            [...draw(stats).querySelectorAll('.stat')].map(box => [
                box.querySelector('.stat__label').textContent,
                box.querySelector('.stat__value').textContent,
            ])
        );
        expect(shown).toEqual({
            median: '25 ms',
            'slowest 5%': '2.3 s',
            errors: '0%',
            'largest paint': '408 ms',
            'first byte': '1.4 s',
            'layout shift': '0.00',
            interaction: '—', // INP: not enough samples
        });
    });

    it('lists the busiest MCP tools, naming only failures', () => {
        const items = [...draw(stats).querySelectorAll('.tools li')].map(li => li.textContent);
        expect(items).toEqual([
            'list_posts: 8 calls',
            'get_project: 6 calls, 3 failed',
            'get_profile: 1 call',
        ]);
    });

    it('says so, rather than showing zeros, when every section is missing', () => {
        const root = draw({ generatedAt: '2026-11-15T01:25:02Z', api: null, uptime: null });
        expect(root.querySelector('.headline--unknown').textContent).toBe('No recent check');
        expect(text(root)).toContain('Nothing measured yet.');
        expect(text(root)).toContain('Not enough visitors measured yet.');
        expect(root.querySelectorAll('.cell')).toHaveLength(0);
        expect(root.querySelectorAll('.tools')).toHaveLength(0);
    });

    it('reports a failed last check as such', () => {
        const root = draw({
            ...stats,
            uptime: { ...stats.uptime, lastProbe: { at: '2026-11-15 01:20:53', ok: false } },
        });
        expect(root.querySelector('.headline--bad').textContent).toBe('The last check failed');
    });

    it('puts text from the data in as text, never as markup', () => {
        const root = draw({
            ...stats,
            mcp: [{ tool: '<img src=x onerror=alert(1)>', calls: 1, errors: 0 }],
        });
        expect(root.querySelector('img')).toBeNull();
        expect(root.querySelector('.tools li').textContent).toContain('<img src=x');
    });

    it('links to the full status page safely', () => {
        const link = draw(stats).querySelector('a');
        expect(link.href).toBe('https://andernet.dev/status/');
        expect(link.rel).toBe('noopener noreferrer');
    });
});

// The panel cannot import modules/status-page.js (it runs in an iframe), so it carries its own copy
// of four formatters. These say the same number the same way on both, or /status/ and the panel
// would disagree about one site in one conversation.
describe('the panel and /status/ agree', () => {
    const MS = [0, 0.4, 1, 25, 999.4, 1000, 2257, 15_000, null, undefined, Number.NaN];
    const RATIOS = [0, 0.00004, 0.0004, 0.01234, 0.0999, 0.1, 0.5, 1, null, Number.NaN];

    const values = data =>
        [...draw(data).querySelectorAll('.stat__value')].map(node => node.textContent);

    it.each(MS)('says %s ms as the page does', ms => {
        const [median] = values({ api: { last24h: { p50Ms: ms, p95Ms: 1, errorRate: 0 } } });
        expect(median).toBe(formatMs(ms));
    });

    it.each(RATIOS)('says an error rate of %s as the page does', ratio => {
        const errors = values({ api: { last24h: { p50Ms: 1, p95Ms: 1, errorRate: ratio } } })[2];
        expect(errors).toBe(formatPercent(ratio));
    });

    it.each([
        [288, 288],
        [287, 288],
        [1, 288],
        [0, 288],
        [99_999, 100_000], // 99.999%: must not read 100%
        [3, 1000],
    ])('says %s of %s checks as the page does', (ok, probes) => {
        const root = draw({ uptime: { days: [{ day: '2026-11-15', probes, ok }] } });
        expect(text(root)).toContain(`${formatUptime(ok, probes)} of ${probes} checks passed`);
    });

    it('colours a day by the same state the page gives it', () => {
        const days = [
            { day: '2026-11-10', probes: 288, ok: 288 },
            { day: '2026-11-11', probes: 288, ok: 287 },
            { day: '2026-11-12', probes: 288, ok: 285 }, // three failed: still not "down"
            { day: '2026-11-13', probes: 288, ok: 0 },
            { day: '2026-11-14', probes: 0, ok: 0 },
        ];
        const shown = [...draw({ uptime: { days } }).querySelectorAll('.cell')].map(cell =>
            cell.className.replace('cell cell--', '')
        );
        const byState = { ok: 'ok', partial: 'warn', down: 'bad', none: 'none' };
        expect(shown).toEqual(days.map(day => byState[dayState(day)]));
        expect(shown).toEqual(['ok', 'warn', 'warn', 'bad', 'none']);
    });

    it('says "1 day", not "1 days"', () => {
        const root = draw({ uptime: { days: [{ day: '2026-11-15', probes: 10, ok: 10 }] } });
        expect(text(root)).toContain('100% of 10 checks passed over 1 day');
    });
});

describe('STATUS_VIEW_HTML', () => {
    it('loads the pinned MCP Apps client, draws with renderStatus, and never uses innerHTML', () => {
        expect(STATUS_VIEW_HTML).toContain('ext-apps@2.0.4');
        expect(STATUS_VIEW_HTML).toContain('renderStatus(stats, document)');
        expect(STATUS_VIEW_HTML).not.toContain('innerHTML');
    });
});
