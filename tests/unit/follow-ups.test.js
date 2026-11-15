import { describe, expect, it, vi } from 'vitest';
import {
    FOLLOW_UPS,
    crawlBody,
    cspBody,
    dueFollowUps,
    openDueIssues,
} from '../../scripts/follow-ups.mjs';

const stats = {
    csp: { last7d: 1, since: '2026-11-13', byDirective: [{ directive: 'script-src', count: 1 }] },
    crawlers: [{ category: 'AI Crawler', requests: 90 }],
};

/** A fake `gh`: `list` answers with the titles already filed, `create` is recorded. */
const fakeGh = filed => {
    const calls = [];
    const run = vi.fn((command, args) => {
        calls.push(args);
        return args[1] === 'list' ? JSON.stringify(filed.map(title => ({ title }))) : '';
    });
    return { run, creates: () => calls.filter(args => args[1] === 'create') };
};

describe('follow-ups', () => {
    it('is due only on or after its date', () => {
        expect(dueFollowUps('2026-11-26')).toEqual([]);
        expect(dueFollowUps('2026-11-27').map(item => item.due)).toEqual(['2026-11-27']);
        expect(dueFollowUps('2026-12-09')).toHaveLength(FOLLOW_UPS.length);
    });

    it('puts the live numbers in the issue bodies', () => {
        expect(cspBody(stats)).toContain('**1**');
        expect(cspBody(stats)).toContain('`script-src`: 1');
        expect(crawlBody(stats)).toContain('AI Crawler: 90');
    });

    it('still opens an issue when the stats could not be read, and says so', () => {
        expect(cspBody(null)).toContain('not available');
        expect(crawlBody({ crawlers: [] })).toContain('not available');
    });

    it('opens each due issue once, and counts a closed one as done', () => {
        const gh = fakeGh([FOLLOW_UPS[0].title]);
        const result = openDueIssues({ today: '2026-12-09', stats, create: true, run: gh.run });
        expect(result.existing).toEqual([FOLLOW_UPS[0].title]);
        expect(result.opened).toEqual([FOLLOW_UPS[1].title]);
        expect(gh.creates()).toHaveLength(1);
        expect(gh.creates()[0]).toContain(FOLLOW_UPS[1].title);
    });

    it('creates nothing on a dry run, and nothing before the date', () => {
        const dry = fakeGh([]);
        const result = openDueIssues({ today: '2026-12-09', stats, create: false, run: dry.run });
        expect(result.opened).toHaveLength(2);
        expect(dry.creates()).toEqual([]);

        const early = fakeGh([]);
        const before = openDueIssues({ today: '2026-11-20', stats, create: true, run: early.run });
        expect(before.opened).toEqual([]);
        expect(before.notDue).toHaveLength(2);
        expect(early.creates()).toEqual([]);
    });
});
