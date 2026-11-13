import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
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

/** True when a trigger glob list would fire for this repo-relative file path. */
const triggeredBy = (globs, file) =>
    globs.some(glob => {
        if (glob === file) return true;
        if (glob.endsWith('/**')) return file.startsWith(glob.slice(0, -2));
        if (glob.startsWith('*.')) return !file.includes('/') && file.endsWith(glob.slice(1));
        return false;
    });

/**
 * Every repo file the specs load, directly or through other files' static imports, outside
 * tests/e2e, as repo-relative paths. Following the imports matters: csp-report.spec.js imports
 * worker/csp-report.js, which imports worker/telemetry.js.
 */
const filesLoadedBySpecs = () => {
    const root = join(import.meta.dirname, '..', '..');
    const pending = readdirSync(join(root, 'tests', 'e2e'))
        .filter(file => file.endsWith('.js'))
        .map(file => `tests/e2e/${file}`);
    const seen = new Set();
    while (pending.length > 0) {
        const file = pending.pop();
        if (seen.has(file)) continue;
        seen.add(file);
        for (const [, specifier] of read(file).matchAll(
            /(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g
        )) {
            const target = posix.normalize(posix.join(posix.dirname(file), specifier));
            if (/\.m?js$/.test(target) && existsSync(join(root, target))) pending.push(target);
        }
    }
    return [...seen].filter(file => !file.startsWith('tests/e2e/'));
};

describe('E2E trigger (e2e.yml)', () => {
    const triggers = pushPaths('.github/workflows/e2e.yml');

    it('reads the trigger list', () => {
        expect(triggers.length).toBeGreaterThan(10);
    });

    // A published file the trigger misses would reach production with no browser test run.
    it('runs on a change to every published path', () => {
        for (const glob of publishedGlobs()) {
            expect(triggers, `${glob} is published but does not trigger E2E`).toContain(glob);
        }
    });

    // The specs mock the Worker, but a few import its helpers directly: a change to those, or to
    // anything they import in turn, must run.
    it('runs on a change to every file the specs load', () => {
        const loaded = filesLoadedBySpecs();
        expect(loaded).toContain('worker/telemetry.js'); // the transitive case, so the walk is proven
        for (const file of loaded) {
            expect(triggeredBy(triggers, file), `${file} is loaded by a spec`).toBe(true);
        }
    });

    it('runs on a change to the specs, their config and the dependencies', () => {
        for (const file of ['tests/e2e/a11y.spec.js', 'playwright.config.js', 'pnpm-lock.yaml']) {
            expect(triggeredBy(triggers, file), file).toBe(true);
        }
    });

    it('does not run for a worker-only change', () => {
        expect(triggeredBy(triggers, 'worker/mcp.js')).toBe(false);
    });

    it('runs every shard it declares, and Quality no longer runs E2E', () => {
        const workflow = read('.github/workflows/e2e.yml');
        const shards = [...workflow.matchAll(/shard: \[([^\]]+)\]/g)][0][1].split(',').length;
        expect(workflow).toContain(`--shard=\${{ matrix.shard }}/${shards}`);
        expect(read('.github/workflows/quality.yml')).not.toMatch(/playwright|test:e2e/);
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
