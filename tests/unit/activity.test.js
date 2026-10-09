import { test, expect } from 'vitest';
import { pickEvent, buildActivity } from '../../modules/utils/activity.js';

const now = new Date().toISOString();

test('a push whose commits lack messages does not throw', () => {
    const event = {
        type: 'PushEvent',
        repo: { name: 'and3rn3t/health' },
        created_at: now,
        payload: { ref: 'refs/heads/main', commits: [{ sha: 'abc' }] },
    };
    expect(() => buildActivity(event, event.repo.name)).not.toThrow();
    expect(buildActivity(event, event.repo.name)).toMatchObject({ type: 'push', message: null });
});

test('pickEvent skips the portfolio repo when other activity exists', () => {
    const events = [
        { type: 'PushEvent', repo: { name: 'and3rn3t/and3rn3t' }, created_at: now, payload: {} },
        { type: 'WatchEvent', repo: { name: 'someone/cool' }, created_at: now, payload: {} },
    ];
    expect(pickEvent(events).repo.name).toBe('someone/cool');
});
