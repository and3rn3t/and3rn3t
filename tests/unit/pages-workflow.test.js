import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom replaces URL, so build the path with join rather than fileURLToPath(new URL(...))
const read = file => readFileSync(join(import.meta.dirname, '..', '..', file), 'utf8');

describe('service worker build id (pages.yml)', () => {
    const workflow = read('.github/workflows/pages.yml');
    const hashed = workflow.match(/BUILD_ID=\$\(find[\s\S]*?cut -c1-12\)/)?.[0] ?? '';

    it('finds the step that hashes the build id', () => {
        expect(hashed).not.toBe('');
    });

    // sw.js serves these cache-first, under a cache named by the build id. If a changed file
    // does not change the id, returning visitors keep the old copy.
    it.each(['fonts', 'icons', 'images'])('covers files under %s/', directory => {
        expect(hashed).toContain(`-path './${directory}/*'`);
    });

    it('serves those file types cache-first', () => {
        const sw = read('sw.js');
        for (const extension of ['.svg', '.png', '.woff2']) expect(sw).toContain(`'${extension}'`);
    });
});
