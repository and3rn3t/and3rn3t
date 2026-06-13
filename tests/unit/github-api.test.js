import { test, expect, beforeEach, vi } from 'vitest';
import { GitHubAPIManager } from '../../modules/github-api.js';

// Stub the debug module (avoids console noise and import errors).
vi.mock('../../modules/debug.js', () => ({
    debug: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ── getCacheKey ─────────────────────────────────────────────────────────────

test('getCacheKey serialises endpoint + params into a stable key', () => {
    const api = new GitHubAPIManager();
    expect(api.getCacheKey('/repos')).toBe('/repos:{}');
    expect(api.getCacheKey('/repos', { sort: 'stars' })).toBe('/repos:{"sort":"stars"}');
});

// ── setCache / getCache ──────────────────────────────────────────────────────

test('getCache returns data before TTL expires', () => {
    const api = new GitHubAPIManager();
    api.setCache('k1', { foo: 1 }, 60_000); // 60 s TTL
    const hit = api.getCache('k1');
    expect(hit).toEqual({ foo: 1 });
});

test('getCache returns null for an unknown key', () => {
    const api = new GitHubAPIManager();
    expect(api.getCache('missing')).toBeNull();
});

test('getCache returns null for an expired entry', () => {
    const api = new GitHubAPIManager();
    api.setCache('k2', { bar: 2 }, -1); // already expired
    expect(api.getCache('k2')).toBeNull();
});

// ── executeWithRetry ────────────────────────────────────────────────────────

test('executeWithRetry resolves immediately on success', async () => {
    const api = new GitHubAPIManager();
    api.baseDelay = 0; // remove jitter for speed
    const result = await api.executeWithRetry(() => Promise.resolve(42));
    expect(result).toBe(42);
});

test('executeWithRetry retries transient errors and eventually resolves', async () => {
    const api = new GitHubAPIManager();
    api.baseDelay = 0;
    let calls = 0;
    const result = await api.executeWithRetry(() => {
        calls++;
        if (calls < 3) {
            return Promise.reject(new Error('network blip'));
        }
        return Promise.resolve('ok');
    }, 3);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
});

test('executeWithRetry rejects immediately on 404 errors (no retry)', async () => {
    const api = new GitHubAPIManager();
    api.baseDelay = 0;
    let calls = 0;
    await expect(
        api.executeWithRetry(() => {
            calls++;
            return Promise.reject(new Error('404 not found'));
        }, 3)
    ).rejects.toThrow('404');
    expect(calls).toBe(1); // bailed after first attempt
});

test('executeWithRetry rejects after exhausting all retries', async () => {
    const api = new GitHubAPIManager();
    api.baseDelay = 0;
    await expect(
        api.executeWithRetry(() => Promise.reject(new Error('always fails')), 2)
    ).rejects.toThrow('always fails');
});

// ── loadCachedGitHubData ─────────────────────────────────────────────────────

test('loadCachedGitHubData memoises the result after first fetch', async () => {
    const api = new GitHubAPIManager();
    const payload = { contributions: 42 };
    globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(payload),
    });
    const first  = await api.loadCachedGitHubData();
    const second = await api.loadCachedGitHubData();
    expect(first).toEqual(payload);
    expect(second).toBe(first); // same reference — memoised
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});
