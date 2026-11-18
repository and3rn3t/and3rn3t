// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const read = file => readFileSync(join(ROOT, file), 'utf8');

/**
 * Every module main.js loads before it runs, following static `import … from` lines only
 * (a dynamic import() loads later and is cached at runtime).
 * @returns {string[]} root-relative paths, main.js first
 */
function staticGraph(entry = 'main.js', seen = new Set()) {
    if (seen.has(entry)) return [...seen];
    seen.add(entry);
    for (const [, spec] of read(entry).matchAll(/^import\s[^;]*?from\s+'(\.[^']+)'/gm)) {
        const file = relative(ROOT, normalize(join(ROOT, dirname(entry), spec)));
        staticGraph(file, seen);
    }
    return [...seen];
}

describe('modules main.js needs before it can run', () => {
    const graph = staticGraph();

    it('finds the graph', () => {
        expect(graph).toContain('modules/theme.js');
        expect(graph).toContain('modules/utils/icon.js');
    });

    it('are all precached by the service worker, so the home page starts offline', () => {
        const sw = read('sw.js');
        for (const file of graph) {
            expect(sw, file).toContain(`'/${file}'`);
        }
    });

    it('are all modulepreloaded by index.html, so none waits on its parent', () => {
        const html = read('index.html');
        for (const file of graph) {
            expect(html, file).toContain(`<link rel="modulepreload" href="${file}" />`);
        }
    });
});
