/**
 * What would keep a page out of the back/forward cache, checked in the source (Phase 15.12). The
 * live site is restored today (`pnpm check:bfcache`), because the presence socket is closed when the
 * tab is hidden (modules/edge.js), before the page is frozen. Chrome no longer refuses a page for an
 * `unload` handler, but Firefox and Safari still do, so none may be added. This is a pattern check:
 * it reads what the site ships, not what a visitor's extensions or Cloudflare add.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function walk(dir, extensions, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, extensions, out);
        else if (extensions.some(ext => name.endsWith(ext)) && !name.startsWith('hero-core'))
            out.push(path);
    }
    return out;
}

// Everything the browser runs: scripts, and the inline ones in the home page and the page templates
const SHIPPED = [
    join(ROOT, 'main.js'),
    join(ROOT, 'sw.js'),
    join(ROOT, 'index.html'),
    ...walk(join(ROOT, 'modules'), ['.js']),
    ...walk(join(ROOT, 'scripts', 'templates'), ['.mjs']),
];

const lines = SHIPPED.flatMap(file =>
    readFileSync(file, 'utf8')
        .split('\n')
        .map((text, index) => `${relative(ROOT, file)}:${index + 1}: ${text.trim()}`)
        .filter(line => !/^\S+:\d+:\s*(\/\/|\*|\/\*|<!--)/.test(line))
);

describe('nothing keeps the site out of the back/forward cache', () => {
    it('no unload or beforeunload listener, and no onunload handler', () => {
        const found = lines.filter(line =>
            /\b(before)?unload\b['"`]|\bonunload\b|\bonbeforeunload\b/i.test(line)
        );
        expect(found).toEqual([]);
    });

    it('the presence socket is closed when the tab is hidden, which is before the page is frozen', () => {
        const edge = readFileSync(join(ROOT, 'modules/edge.js'), 'utf8');
        expect(edge).toMatch(/visibilitychange/);
        expect(edge).toMatch(/document\.hidden\s*\?\s*close\(\)\s*:\s*open\(\)/);
    });

    it('no zone rule sends Cache-Control: no-store for a page', () => {
        for (const file of ['scripts/zone-headers.mjs', 'scripts/zone-cache.mjs']) {
            expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toMatch(/no-store/i);
        }
    });

    it('looks at the files it should', () => {
        const names = SHIPPED.map(file => relative(ROOT, file));
        for (const expected of ['main.js', 'index.html', 'modules/edge.js', 'sw.js']) {
            expect(names).toContain(expected);
        }
        expect(lines.length).toBeGreaterThan(2000);
    });
});
