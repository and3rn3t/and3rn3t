import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUPS, KINDS, describeRule, mergeRules } from '../../scripts/cloudflare-zone.mjs';
import { CACHE_EXPRESSION, EDGE_TTL_SECONDS, cacheRules } from '../../scripts/zone-cache.mjs';
import { HOST, RULE_PREFIX } from '../../scripts/zone-headers.mjs';

const read = file => readFileSync(join(import.meta.dirname, '..', '..', file), 'utf8');

describe('the cache rule', () => {
    const rules = cacheRules();
    const [ref, rule] = Object.entries(rules)[0];

    it('is ours, and only for the apex host (the zone carries about twenty other apps)', () => {
        expect(Object.keys(rules)).toHaveLength(1);
        expect(ref.startsWith(RULE_PREFIX)).toBe(true);
        expect(rule.expression).toContain(`http.host eq "${HOST}"`);
    });

    it('leaves the Worker alone: /api/, /mcp and /.well-known/ are not cached', () => {
        expect(CACHE_EXPRESSION).toContain('not starts_with(http.request.uri.path, "/api/")');
        expect(CACHE_EXPRESSION).toContain('http.request.uri.path ne "/mcp"');
        expect(CACHE_EXPRESSION).toContain(
            'not starts_with(http.request.uri.path, "/.well-known/")'
        );
    });

    it('leaves agents asking for Markdown exactly as they are today', () => {
        expect(CACHE_EXPRESSION).toContain(
            'not any(http.request.headers["accept"][*] contains "text/markdown")'
        );
    });

    it('overrides the origin TTL for successful pages only, and never keeps an error', () => {
        const { cache, edge_ttl, browser_ttl } = rule.action_parameters;
        expect(rule.action).toBe('set_cache_settings');
        expect(cache).toBe(true);
        expect(edge_ttl.mode).toBe('override_origin');
        expect(edge_ttl.default).toBe(EDGE_TTL_SECONDS);
        expect(edge_ttl.status_code_ttl).toEqual([
            { status_code_range: { from: 200, to: 299 }, value: EDGE_TTL_SECONDS },
            { status_code_range: { from: 400, to: 599 }, value: -1 },
        ]);
        expect(browser_ttl.mode).toBe('respect_origin');
    });

    it('is short enough that a missed purge heals within the hour', () => {
        expect(EDGE_TTL_SECONDS).toBeLessThanOrEqual(3600);
    });

    it('is a group the zone script knows how to apply, in the cache phase', () => {
        expect(GROUPS.cache.kind).toBe('ruleset');
        expect(GROUPS.cache.phase).toBe('http_request_cache_settings');
        expect(Object.keys(KINDS)).toContain(GROUPS.cache.kind);
        expect(GROUPS.cache.values()).toEqual(rules);
    });

    it('is described on one line', () => {
        expect(describeRule(rule)).toBe(
            `when ${CACHE_EXPRESSION} -> cache, edge TTL ${EDGE_TTL_SECONDS}s (override_origin)`
        );
    });

    it('goes in next to a rule that is not ours, and leaves it where it is', () => {
        const foreign = { id: 'abc', expression: 'true', action: 'set_cache_settings' };
        expect(mergeRules([foreign], rules)).toEqual([foreign, { ref, ...rule }]);
    });
});

describe('purging the cache on deploy (pages.yml)', () => {
    const workflow = read('.github/workflows/pages.yml');
    const purge = workflow.slice(workflow.indexOf('  purge-cache:'));

    it('purges by hostname, never everything, with the secret and not a literal token', () => {
        expect(purge).toContain('"hosts":["andernet.dev"]');
        expect(workflow).not.toContain('purge_everything');
        expect(purge).toContain('secrets.CLOUDFLARE_PURGE_TOKEN');
    });

    it('runs after the deploy, in its own job with no repository permissions', () => {
        expect(purge).toMatch(/purge-cache:\s+needs: deploy/);
        expect(purge).toMatch(/permissions: \{\}/);
    });

    it('purges twice, because GitHub Pages can serve the previous copy just after a deploy', () => {
        expect(purge.match(/^ {10}purge$/gm)).toHaveLength(2);
        expect(purge).toMatch(/sleep 60/);
    });

    // A run cancelled after its deploy published would skip the purge, and the edge would keep
    // the old pages for up to an hour
    it('is never cancelled by a newer run', () => {
        expect(workflow).toMatch(/concurrency:\s+group: 'pages'\s+cancel-in-progress: false/);
        expect(workflow).not.toContain('cancel-in-progress: true');
    });

    it('makes Lighthouse wait for it, so it measures what visitors get', () => {
        expect(workflow.match(/needs: \[deploy, purge-cache\]/g)).toHaveLength(2);
    });
});
