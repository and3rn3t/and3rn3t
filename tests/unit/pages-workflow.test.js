import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom replaces URL, so build the path with join rather than fileURLToPath(new URL(...))
const read = file => readFileSync(join(import.meta.dirname, '..', '..', file), 'utf8');

/** The push trigger's `paths:` globs, from the `on:` block of a workflow file. */
const pushPaths = file =>
    [
        ...(read(file).match(/^\s+paths:\n([\s\S]*?)\n\s*workflow_dispatch:/m)?.[1] ?? '').matchAll(
            /-\s+'([^']+)'/g
        ),
    ].map(match => match[1]);

/** The sparse-checkout allowlist, rewritten as the equivalent trigger globs. */
const publishedGlobs = () =>
    (
        read('.github/workflows/pages.yml')
            .match(/sparse-checkout: \|\n([\s\S]*?)\n\s*sparse-checkout-cone-mode/)?.[1]
            .match(/^\s+\S+\s*$/gm) ?? []
    )
        .map(line => line.trim().replace(/^\//, ''))
        .map(pattern => (pattern.endsWith('/') ? `${pattern}**` : pattern));

describe('deploy trigger (pages.yml)', () => {
    it('reads the publish allowlist', () => {
        expect(publishedGlobs().length).toBeGreaterThan(10);
    });

    // A file the site publishes but the trigger misses would merge without ever going live.
    it('deploys on a change to every published path', () => {
        const triggers = pushPaths('.github/workflows/pages.yml');
        for (const glob of publishedGlobs()) {
            expect(triggers, `${glob} is published but does not trigger a deploy`).toContain(glob);
        }
    });

    it('re-deploys when the workflow itself changes', () => {
        expect(pushPaths('.github/workflows/pages.yml')).toContain('.github/workflows/pages.yml');
    });

    it('gates the deploy on the fast checks', () => {
        expect(read('.github/workflows/pages.yml')).toMatch(/deploy:\n\s+needs: verify/);
    });
});

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
