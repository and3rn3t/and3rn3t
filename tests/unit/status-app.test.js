/**
 * The status panel that show_status draws inside Claude (worker/mcp-app-status.js): its drawing
 * code run against sample data, the way the iframe runs it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { STATUS_RENDER_SOURCE, STATUS_VIEW_HTML } from '../../worker/mcp-app-status.js';

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
            'cell cell--bad', // 280 of 288 is 97.2%
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
            errors: '0.00%',
            'largest paint': '408 ms',
            'first byte': '1.4 s',
            'layout shift': '0.00',
            interaction: '–', // INP: not enough samples
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

describe('STATUS_VIEW_HTML', () => {
    it('loads the pinned MCP Apps client, draws with renderStatus, and never uses innerHTML', () => {
        expect(STATUS_VIEW_HTML).toContain('ext-apps@2.0.4');
        expect(STATUS_VIEW_HTML).toContain('renderStatus(stats, document)');
        expect(STATUS_VIEW_HTML).not.toContain('innerHTML');
    });
});
