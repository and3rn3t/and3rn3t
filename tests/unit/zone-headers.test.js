/**
 * The response headers andernet.dev sends (scripts/zone-headers.mjs) and the code that writes
 * them to the zone (scripts/cloudflare-zone.mjs). The API is replaced by a fake that behaves
 * like the real one where it matters: a PUT replaces every rule in the phase.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKER_ORIGIN } from '../../modules/config.js';
import { discoveryResponse } from '../../worker/discovery.js';
import {
    GROUPS,
    KINDS,
    desiredValues,
    mergeRules,
    describeRule,
    diffValues,
    securityTxtExpiry,
    unintendedChanges,
    stable,
} from '../../scripts/cloudflare-zone.mjs';
import {
    HOST,
    LINK_HEADER,
    RULE_PREFIX,
    SECURITY_HEADERS,
    buildCsp,
    cspHash,
    headerRules,
    inlineBlocks,
    inlineHashes,
    pageFiles,
} from '../../scripts/zone-headers.mjs';

// jsdom replaces URL, so build the path with join rather than fileURLToPath(new URL(...))
const ROOT = join(import.meta.dirname, '..', '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');

afterEach(() => vi.unstubAllGlobals());

describe('inlineBlocks', () => {
    const html = `
        <script>one()</script>
        <script type="module">two()</script>
        <script type='text/javascript'>three()</script>
        <script src="/x.js"></script>
        <script type="application/ld+json">{"a":1}</script>
        <script type="application/json">{}</script>
        <style>a{}</style>
        <style media="print">b{}</style>`;

    it('finds the scripts that run and none of the data blocks or external files', () => {
        expect(inlineBlocks(html).scripts).toEqual(['one()', 'two()', 'three()']);
    });

    // A browser accepts whitespace and even attributes in an end tag: "</script >" ends a script
    it('finds blocks whose end tag has spaces or attributes', () => {
        const odd =
            '<script>one()</script ><script>two()</script\n><style>a{}</style foo="1"><script>three()</SCRIPT x>';
        expect(inlineBlocks(odd)).toEqual({
            scripts: ['one()', 'two()', 'three()'],
            styles: ['a{}'],
        });
    });

    it('finds every style element', () => {
        expect(inlineBlocks(html).styles).toEqual(['a{}', 'b{}']);
    });

    // HTML tag and attribute names are case-insensitive: <SCRIPT> is a script
    it('finds scripts and styles written in capitals, and reads their attributes in any case', () => {
        const shouting = `<SCRIPT>one()</SCRIPT><Script TYPE="module">two()</Script>
            <SCRIPT SRC="/x.js"></SCRIPT><SCRIPT TYPE="application/LD+JSON">{}</SCRIPT>
            <STYLE>a{}</STYLE>`;
        expect(inlineBlocks(shouting)).toEqual({ scripts: ['one()', 'two()'], styles: ['a{}'] });
    });
});

describe('cspHash', () => {
    // SHA-256("abc"), base64, from FIPS 180-2
    it('is the base64 SHA-256 of the exact text, in CSP syntax', () => {
        expect(cspHash('abc')).toBe("'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
    });

    it('changes with one space, because the browser hashes the text as it is', () => {
        expect(cspHash('abc ')).not.toBe(cspHash('abc'));
    });
});

describe('the published pages', () => {
    const files = pageFiles(ROOT);
    const hashes = inlineHashes(ROOT);

    // pages.yml publishes /*.html: a page left out would get the CSP header but no hashes for
    // its own inline code
    it('covers every .html file at the root, as pages.yml publishes them', () => {
        const root = readdirSync(ROOT).filter(name => name.endsWith('.html'));
        expect(root).toContain('offline.html');
        for (const name of root) expect(files, name).toContain(name);
    });

    it('covers the home page, 404, and every project and post page', () => {
        expect(files).toContain('index.html');
        expect(files).toContain('404.html');
        expect(files.filter(file => file.startsWith('projects/')).length).toBeGreaterThan(10);
        expect(files.filter(file => file.startsWith('posts/')).length).toBeGreaterThan(0);
    });

    // The status page has its own file: a script added there later would be blocked by the CSP
    it('covers the status page', () => {
        expect(files).toContain('status/index.html');
    });

    // An independent count: every <script> opening is a file, a data block or hashed. If the
    // extraction missed one, the real CSP would be missing its hash.
    it.each(files)('%s: every <script> and <style> is accounted for', file => {
        const html = read(file);
        const opened = (html.match(/<script[\s>]/gi) ?? []).length;
        const external = (html.match(/<script[^>]*\ssrc\s*=/gi) ?? []).length;
        const data = (html.match(/<script[^>]*type=["']application\/(ld\+)?json["']/gi) ?? [])
            .length;
        const { scripts, styles } = inlineBlocks(html);
        expect(scripts.length + external + data).toBe(opened);
        expect(styles.length).toBe((html.match(/<style[\s>]/gi) ?? []).length);
        for (const text of scripts) expect(hashes.scripts).toContain(cspHash(text));
        for (const text of styles) expect(hashes.styles).toContain(cspHash(text));
    });

    it('has no inline event handlers or style attributes, which a hash cannot allow', () => {
        for (const file of files) {
            const html = read(file);
            expect(html, file).not.toMatch(/\son[a-z]+\s*=\s*["']/);
            expect(html, file).not.toMatch(/\sstyle\s*=\s*["']/);
        }
    });
});

describe('the Content-Security-Policy', () => {
    const hashes = { scripts: ["'sha256-AAA='"], styles: ["'sha256-BBB='"] };
    const csp = buildCsp(hashes);
    const directive = name => csp.split('; ').find(part => part.startsWith(`${name} `));

    it('allows inline scripts and style elements only by hash, and never unsafe-eval', () => {
        for (const name of ['script-src', 'style-src', 'default-src']) {
            expect(directive(name), name).not.toContain("'unsafe-inline'");
        }
        expect(csp).not.toContain("'unsafe-eval'");
        expect(directive('script-src')).toContain("'sha256-AAA='");
        expect(directive('style-src')).toContain("'sha256-BBB='");
    });

    // The heatmap's cells carry style="--week:..;grid-row:..", and Cloudflare adds a hidden link
    // with one: enforcing without this would break the heatmap
    it('allows style attributes, and only through style-src-attr', () => {
        expect(directive('style-src-attr')).toBe("style-src-attr 'unsafe-inline'");
        expect(csp.match(/'unsafe-inline'/g)).toHaveLength(1);
    });

    it('lets the WebAssembly hero compile, and nothing else evaluate', () => {
        expect(directive('script-src')).toContain("'wasm-unsafe-eval'");
    });

    it('allows the services the page uses: Turnstile, analytics, Formspree, GitHub and the Worker', () => {
        expect(directive('script-src')).toContain('https://challenges.cloudflare.com');
        expect(directive('script-src')).toContain('https://static.cloudflareinsights.com');
        expect(directive('frame-src')).toContain('https://challenges.cloudflare.com');
        expect(directive('form-action')).toContain('https://formspree.io');
        expect(directive('connect-src')).toContain('https://api.github.com');
        // The fallback address modules/config.js uses when the page is not on andernet.dev
        expect(directive('connect-src')).toContain(WORKER_ORIGIN);
        expect(directive('connect-src')).toContain('wss://andernet.dev');
    });

    // The policy is report-only: this is the whole point of it
    it('sends its reports to the Worker, on this origin', () => {
        expect(directive('report-uri')).toBe('report-uri /api/csp-report');
    });

    it('forbids plugins, framing and a changed <base>', () => {
        expect(directive('object-src')).toBe("object-src 'none'");
        expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
        expect(directive('base-uri')).toBe("base-uri 'self'");
    });

    it('is one header value with no newline', () => {
        expect(csp).not.toMatch(/[\n\r]/);
    });
});

describe('the rules', () => {
    const rules = headerRules(inlineHashes(ROOT));

    it('are ours by name, so a rule someone added by hand is never touched', () => {
        for (const ref of Object.keys(rules)) expect(ref.startsWith(RULE_PREFIX)).toBe(true);
    });

    // The zone has ~20 other hostnames, separate apps: a header here must not reach them
    it('apply to the apex host only', () => {
        for (const [ref, rule] of Object.entries(rules)) {
            expect(rule.expression, ref).toContain(`http.host eq "${HOST}"`);
        }
    });

    it('rewrite response headers, with lower-case names and the "set" operation', () => {
        for (const rule of Object.values(rules)) {
            expect(rule.action).toBe('rewrite');
            for (const [name, change] of Object.entries(rule.action_parameters.headers)) {
                expect(name).toBe(name.toLowerCase());
                expect(change.operation).toBe('set'); // "set" replaces, so a later run cannot pile up duplicates
            }
        }
    });

    it('send Link and the CSP on HTML pages only, not on scripts, images or JSON', () => {
        expect(rules['andernet-link-header'].expression).toContain('media_type eq "text/html"');
        expect(rules['andernet-csp-report-only'].expression).toContain('media_type eq "text/html"');
    });

    it('send the CSP as report-only, so nothing is blocked yet', () => {
        const headers = Object.keys(rules['andernet-csp-report-only'].action_parameters.headers);
        expect(headers).toEqual(['content-security-policy-report-only']);
    });

    it('set HSTS for this host only: no includeSubDomains and no preload', () => {
        const hsts = SECURITY_HEADERS['strict-transport-security'];
        expect(hsts).toMatch(/^max-age=\d+$/);
        expect(Number(hsts.split('=')[1])).toBeGreaterThanOrEqual(15552000);
    });

    // Every document the Link header advertises must exist, or the header points at a 404
    it('Link header points at documents that are served', async () => {
        const targets = [...LINK_HEADER.matchAll(/<([^>]+)>/g)].map(match => match[1]);
        expect(targets).toHaveLength(3);
        for (const target of targets) {
            const served =
                target === '/llms.txt'
                    ? Boolean(read('llms.txt'))
                    : (await discoveryResponse(target, 'GET'))?.status === 200;
            expect(served, target).toBe(true);
        }
        expect(LINK_HEADER).toContain('rel="api-catalog"');
    });

    it('describeRule says when a rule applies and what it sets', () => {
        expect(describeRule(rules['andernet-security-headers'])).toMatch(
            /^when http\.host eq "andernet\.dev" -> set x-content-type-options, /
        );
    });
});

describe('stable and diffValues', () => {
    it('compares objects whatever order their keys came in', () => {
        expect(stable({ a: 1, b: { c: 2, d: 3 } })).toBe(stable({ b: { d: 3, c: 2 }, a: 1 }));
        expect(stable([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
        expect(diffValues({ r: { x: 1, y: 2 } }, { r: { y: 2, x: 1 } })).toEqual([]);
    });

    it('with prune, also reports what we own that is no longer wanted', () => {
        const current = { keep: 1, gone: 2 };
        expect(diffValues(current, { keep: 1 })).toEqual([]);
        expect(diffValues(current, { keep: 1 }, { prune: true })).toEqual([
            { name: 'gone', from: 2, to: undefined },
        ]);
    });
});

describe('security.txt expiry', () => {
    const now = Date.parse('2026-11-12T00:00:00Z');
    const days = n => new Date(now + n * 86_400_000).toISOString();

    it('keeps an expiry that is more than 90 days away, so a run changes nothing', () => {
        expect(securityTxtExpiry(days(200), now)).toBe(days(200));
    });

    it.each([[days(60)], [days(-5)], ['not a date'], [undefined]])(
        'gives a year from now to %s',
        current => {
            const next = securityTxtExpiry(current, now);
            expect(next).toBe('2027-11-12T00:00:00Z');
            expect(Date.parse(next) - now).toBeLessThan(366 * 86_400_000);
        }
    );

    // The API adds `enabled` to what it returns. If it is not in the desired state, the first
    // publication writes fine and is then reported as having changed something unasked, and a
    // file that exists but is switched off is not seen as different
    it('tracks `enabled` as desired state, so first publication and re-enabling both work', () => {
        const desired = desiredValues(GROUPS['security-txt'], {});
        expect(desired.enabled).toBe(true);
        const changes = diffValues({}, desired).map(change => change.name);
        expect(changes).toContain('enabled');
        expect(unintendedChanges({}, { ...desired }, changes)).toEqual([]);
        expect(diffValues({ ...desired, enabled: false }, desired).map(c => c.name)).toEqual([
            'enabled',
        ]);
        expect(diffValues(desired, desired)).toEqual([]);
    });

    it('is a valid file for the group: a contact, a canonical address and an expiry', () => {
        const values = desiredValues(GROUPS['security-txt'], {});
        expect(values.contact[0]).toMatch(/^mailto:/);
        expect(values.canonical).toEqual([`https://${HOST}/.well-known/security.txt`]);
        expect(Date.parse(values.expires)).toBeGreaterThan(Date.now());
        expect(values.preferred_languages).toBe('en');
    });
});

/** A fake of the one endpoint that matters: GET and PUT on a phase's entrypoint ruleset. */
function fakeRulesetApi(initialRules, { dropForeign = false } = {}) {
    const state = { rules: initialRules, puts: [] };
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url, { method, body }) => {
            const ok = result => Response.json({ success: true, result });
            if (!url.includes('/entrypoint')) return new Response('{}', { status: 400 });
            if (method === 'GET') {
                return state.rules
                    ? ok({ rules: state.rules })
                    : new Response('{}', { status: 404 });
            }
            const sent = JSON.parse(body).rules;
            state.puts.push(sent);
            const kept = dropForeign
                ? sent.filter(rule => rule.ref?.startsWith(RULE_PREFIX))
                : sent;
            state.rules = kept.map((rule, index) => ({ id: rule.id ?? `new-${index}`, ...rule }));
            return ok({ rules: state.rules });
        })
    );
    return state;
}

describe('mergeRules', () => {
    const ours = (ref, extra = {}) => ({ ref: `${RULE_PREFIX}${ref}`, ...extra });
    const wanted = {
        [`${RULE_PREFIX}a`]: { expression: 'new-a' },
        [`${RULE_PREFIX}c`]: { expression: 'new-c' },
    };

    it('keeps the rules in place, replaces ours there, drops stale ones, appends new ones', () => {
        const merged = mergeRules(
            [
                ours('a', { expression: 'old' }),
                { id: 'x', ref: 'theirs' },
                ours('stale'),
                { id: 'y' },
            ],
            wanted
        );
        expect(merged.map(rule => rule.ref ?? rule.id)).toEqual([
            `${RULE_PREFIX}a`,
            'theirs',
            'y',
            `${RULE_PREFIX}c`,
        ]);
        expect(merged[0].expression).toBe('new-a');
        expect(merged[1]).toEqual({ id: 'x', ref: 'theirs' });
    });

    it('with no rules in the phase yet, is just ours in the order wanted', () => {
        expect(mergeRules([], wanted).map(rule => rule.ref)).toEqual([
            `${RULE_PREFIX}a`,
            `${RULE_PREFIX}c`,
        ]);
    });
});

describe('writing the ruleset', () => {
    const group = { phase: 'http_response_headers_transform' };
    const desired = headerRules({ scripts: ["'sha256-AAA='"], styles: [] });
    const handRolled = {
        id: 'abc123',
        ref: 'my-own-rule',
        description: 'added in the dashboard',
        expression: 'true',
        action: 'rewrite',
        action_parameters: { headers: { 'x-mine': { operation: 'set', value: '1' } } },
    };

    it('reads a phase with no ruleset yet (a 404) as having no rules', async () => {
        fakeRulesetApi(null);
        expect(await KINDS.ruleset.read('t', 'z', [], group)).toEqual({});
    });

    it('creates our rules, and sends a rule that is not ours back exactly as it was', async () => {
        const state = fakeRulesetApi([handRolled]);
        await KINDS.ruleset.write('t', 'z', [], group, desired);
        const [sent] = state.puts;
        expect(sent[0]).toEqual(handRolled);
        expect(sent.slice(1).map(rule => rule.ref)).toEqual(Object.keys(desired));
        // Read back, the rules are what was asked for, and nothing is left to change
        const after = await KINDS.ruleset.read('t', 'z', [], group);
        expect(diffValues(after, desired, { prune: true })).toEqual([]);
    });

    it('removes a rule of ours that is no longer wanted, and only that', async () => {
        const stale = {
            id: 's1',
            ref: `${RULE_PREFIX}old`,
            description: 'old',
            expression: 'true',
            action: 'rewrite',
        };
        const state = fakeRulesetApi([handRolled, stale]);
        const before = await KINDS.ruleset.read('t', 'z', [], group);
        expect(diffValues(before, desired, { prune: true }).map(change => change.name)).toContain(
            `${RULE_PREFIX}old`
        );
        await KINDS.ruleset.write('t', 'z', [], group, desired);
        expect(state.rules.map(rule => rule.ref)).toEqual(['my-own-rule', ...Object.keys(desired)]);
    });

    it('does not report the API-added fields (id, version, dates) as differences', async () => {
        const state = fakeRulesetApi([]);
        await KINDS.ruleset.write('t', 'z', [], group, desired);
        state.rules = state.rules.map(rule => ({
            ...rule,
            version: '3',
            last_updated: 'now',
            categories: [],
        }));
        const after = await KINDS.ruleset.read('t', 'z', [], group);
        expect(diffValues(after, desired, { prune: true })).toEqual([]);
    });

    // Response header rules run in order and a later one overwrites an earlier one, so a
    // dashboard exception placed after one of our rules has to stay after it
    it('replaces our rules where they stand and keeps the others between them', async () => {
        const ours = ref => ({
            id: ref,
            ref: `${RULE_PREFIX}${ref}`,
            description: 'old',
            expression: 'old',
            action: 'rewrite',
        });
        const exception = { ...handRolled, id: 'exception' };
        const state = fakeRulesetApi([ours('link-header'), exception, ours('security-headers')]);
        await KINDS.ruleset.write('t', 'z', [], group, desired);
        expect(
            state.rules.map(rule => (rule.ref.startsWith(RULE_PREFIX) ? rule.ref : rule.id))
        ).toEqual([
            `${RULE_PREFIX}link-header`,
            'exception',
            `${RULE_PREFIX}security-headers`,
            `${RULE_PREFIX}csp-report-only`,
        ]);
        // and the old definitions were replaced by the new ones
        expect(state.rules[0].expression).toBe(desired[`${RULE_PREFIX}link-header`].expression);
    });

    // The failure that would hurt: the API drops a rule we did not write
    it('fails loudly if a rule that is not ours disappears', async () => {
        fakeRulesetApi([handRolled], { dropForeign: true });
        await expect(KINDS.ruleset.write('t', 'z', [], group, desired)).rejects.toThrow(
            /not in the order that was sent/
        );
    });

    it('fails loudly if the API reorders the rules it was sent', async () => {
        const state = fakeRulesetApi([handRolled]);
        const fetchWas = globalThis.fetch;
        vi.stubGlobal('fetch', async (url, options) => {
            const response = await fetchWas(url, options);
            if (options.method === 'PUT') state.rules.reverse();
            return response;
        });
        await expect(KINDS.ruleset.write('t', 'z', [], group, desired)).rejects.toThrow(
            /not in the order that was sent/
        );
    });
});
