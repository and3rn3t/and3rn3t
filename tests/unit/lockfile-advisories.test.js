/**
 * Dependency advisories that are fixed in the lockfile by an override, pinned so a refactor of the
 * overrides (or Renovate pruning one that looks unused) cannot quietly bring the vulnerable copy
 * back. Dependabot alerts after the fact; this fails the build first.
 *
 * Each entry is a package and the version range the advisory covers.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const lockfile = readFileSync(join(import.meta.dirname, '..', '..', 'pnpm-lock.yaml'), 'utf8');

const parse = version => version.split('.').map(Number);
const compare = (a, b) => {
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
};

/** The versions of a package that are resolved in the lockfile. */
const resolved = name =>
    [
        ...lockfile.matchAll(
            new RegExp(`^ {2}${name.replace('/', '\\/')}@(\\d+\\.\\d+\\.\\d+):`, 'gm')
        ),
    ].map(match => match[1]);

const ADVISORIES = [
    {
        id: 'GHSA-g3hv-75wg-m249',
        name: 'minimatch',
        summary: 'denial of service through glob expansion',
        from: '7.0.0',
        before: '11.0.1',
    },
];

describe('advisories fixed in the lockfile', () => {
    it('finds the packages it checks (the lockfile format has not changed under it)', () => {
        for (const { name } of ADVISORIES) expect(resolved(name).length, name).toBeGreaterThan(0);
    });

    it.each(ADVISORIES)(
        '$name has no copy in $from up to (not including) $before ($id)',
        ({ name, from, before }) => {
            const vulnerable = resolved(name).filter(
                version => compare(version, from) >= 0 && compare(version, before) < 0
            );
            expect(
                vulnerable,
                `${name} ${vulnerable.join(', ')} is affected: see pnpm-workspace.yaml overrides`
            ).toEqual([]);
        }
    );

    it('compares versions numerically, so 11.0.10 is not older than 11.0.2', () => {
        expect(compare('11.0.10', '11.0.2')).toBeGreaterThan(0);
        expect(compare('10.9.9', '11.0.1')).toBeLessThan(0);
        expect(compare('11.0.1', '11.0.1')).toBe(0);
    });
});
