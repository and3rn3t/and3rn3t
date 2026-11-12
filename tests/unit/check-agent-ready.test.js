import { describe, expect, it, vi } from 'vitest';
import {
    NOT_APPLICABLE,
    parseReport,
    scan,
    summarise,
    surprises,
} from '../../scripts/check-agent-ready.mjs';

const REPORT = `# Agent Readiness: https://andernet.dev

**Level 4/5 -- Agent-Integrated**

## Discoverability (3/4 passing)
- PASS robotsTxt: robots.txt exists
- PASS webMcp: Found 5 WebMCP tools
- FAIL dnsAid -- Publish DNS for AI Discovery
  **Fix:** something
- FAIL oauthDiscovery -- Publish OAuth metadata
`;

describe('parseReport', () => {
    it('reads the level and the passing and failing checks', () => {
        expect(parseReport(REPORT)).toEqual({
            level: '4/5',
            passing: ['robotsTxt', 'webMcp'],
            failing: ['dnsAid', 'oauthDiscovery'],
        });
    });

    it('copes with a report it does not recognise', () => {
        expect(parseReport('nope')).toEqual({ level: null, passing: [], failing: [] });
    });
});

describe('surprises', () => {
    it('ignores the checks that do not apply, and flags any other failure', () => {
        expect(surprises(parseReport(REPORT))).toEqual([]);
        expect(surprises({ failing: ['webMcp', 'dnsAid'] })).toEqual(['webMcp']);
    });

    it('lists exactly the five checks that do not apply to a portfolio', () => {
        expect(NOT_APPLICABLE).toHaveLength(5);
    });
});

describe('summarise', () => {
    it('names a failure worth a look', () => {
        const text = summarise('https://x.test', {
            level: '3/5',
            passing: [],
            failing: ['webMcp'],
        });
        expect(text).toContain('Level **3/5**');
        expect(text).toContain('`webMcp`');
    });

    it('says all is well when only the n/a checks fail', () => {
        expect(summarise('https://x.test', parseReport(REPORT))).toContain('Nothing failing');
    });
});

describe('scan', () => {
    const answer = body => vi.fn(async () => new Response(body, { status: 200 }));

    it('takes the text of the last data line of the stream', async () => {
        const event = text =>
            `data: ${JSON.stringify({ result: { content: [{ type: 'text', text }] } })}`;
        const fetchImpl = answer(`event: message\n${event('first')}\n${event('last')}\n`);
        expect(await scan('https://x.test', fetchImpl)).toBe('last');
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params.arguments.url).toBe(
            'https://x.test'
        );
    });

    it('throws on an error status or an empty stream', async () => {
        await expect(
            scan(
                'u',
                vi.fn(async () => new Response('', { status: 503 }))
            )
        ).rejects.toThrow(/503/);
        await expect(scan('u', answer('event: ping\n'))).rejects.toThrow(/no result/);
    });
});
