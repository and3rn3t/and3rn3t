/**
 * Fuzzy search scoring tests for CommandPalette.score()
 *
 * score() is a subsequence fuzzy match — it returns -1 for no match,
 * or a positive integer (higher = better) for a match.
 */
import { test, expect, beforeEach, vi } from 'vitest';

// Minimal DOM so CommandPalette constructor doesn't throw.
document.body.innerHTML = `
  <div id="global-search-modal">
    <input id="global-search-input" />
    <div id="search-results-content"></div>
    <div id="search-results-empty"></div>
    <button id="global-search-close"></button>
  </div>
`;

vi.mock('../../modules/debug.js', () => ({
    debug: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Stub fetch so loadProjects() doesn't throw.
globalThis.fetch = vi.fn().mockRejectedValue(new Error('no network in tests'));

let score;

beforeEach(async () => {
    vi.resetModules();
    // Re-import after every reset so module-level DOM queries re-run.
    const mod = await import('../../modules/command-palette.js');
    // score is on the singleton instance; grab the method bound to a throwaway instance.
    // We import the default export indirectly via the named export that main.js uses.
    // Since command-palette.js only exports `commandPalette` (the singleton),
    // we access its score method directly.
    score = mod.commandPalette.score.bind(mod.commandPalette);
});

// ── No-match cases ───────────────────────────────────────────────────────────

test('score returns -1 when query letters do not appear in item', () => {
    const item = { title: 'Toggle theme', subtitle: '' };
    expect(score('xyz', item)).toBe(-1);
});

// ── Match cases ───────────────────────────────────────────────────────────────

test('score returns >= 0 for a matching query', () => {
    const item = { title: 'Toggle theme', subtitle: '' };
    expect(score('theme', item)).toBeGreaterThanOrEqual(0);
});

test('score returns 0 for an empty query (shows everything)', () => {
    const item = { title: 'Anything', subtitle: '' };
    expect(score('', item)).toBe(0);
});

test('consecutive letter matches score higher than scattered matches', () => {
    const item = { title: 'Download résumé', subtitle: '' };
    const consecutive = score('dow', item);   // d-o-w consecutive
    const scattered   = score('dlr', item);   // d...l...r scattered
    expect(consecutive).toBeGreaterThan(scattered);
});

test('score is case-insensitive', () => {
    const item = { title: 'GitHub Profile', subtitle: '' };
    expect(score('github', item)).toEqual(score('GITHUB', item));
});

test('score searches subtitle and keywords too', () => {
    const item = {
        title: 'Open GitHub',
        subtitle: 'https://github.com/and3rn3t',
        keywords: 'profile social',
    };
    // 'soc' appears in keywords
    expect(score('soc', item)).toBeGreaterThanOrEqual(0);
});

// ── Ranking ───────────────────────────────────────────────────────────────────

test('exact title prefix ranks above partial scatter', () => {
    const palette = item => score('tog', item);
    const togItem = { title: 'Toggle theme', subtitle: '' };
    const other   = { title: 'Go to projects', subtitle: '' };
    // 't o g' consecutive in "toggle" vs scattered in "to projects" ('t'...'o'...'g')
    expect(palette(togItem)).toBeGreaterThan(palette(other));
});
