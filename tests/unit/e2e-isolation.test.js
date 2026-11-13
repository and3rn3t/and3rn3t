/**
 * No e2e run may reach the deployed Worker: it would inflate the live view count, open real
 * "here now" sockets and make tests depend on the network. The `page` fixture is mocked
 * (tests/e2e/fixtures.js), but a test that builds its own browser context gets no fixture, so it
 * has to call mockWorker on the context itself, before opening a page.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '..', 'e2e');
const specs = readdirSync(DIR).filter(name => name.endsWith('.spec.js'));

describe('e2e isolation from the deployed Worker', () => {
    it('finds the specs', () => {
        expect(specs.length).toBeGreaterThan(10);
    });

    it.each(specs)('%s mocks the Worker wherever it builds its own context or page', name => {
        const source = readFileSync(join(DIR, name), 'utf8');
        const buildsOwn = /\.newContext\(|\.newPage\(|chromium\.launch\(/.test(source);
        if (!buildsOwn) return;
        expect(source, `${name} builds its own context but never calls mockWorker`).toMatch(
            /mockWorker\(/
        );
        // ...and that call comes before the page opens, in every place it builds one
        const contexts = [...source.matchAll(/(\w+)\s*=\s*await browser\.newContext\(/g)];
        for (const [, variable] of contexts) {
            expect(source, `${name}: ${variable} is never passed to mockWorker`).toMatch(
                new RegExp(`mockWorker\\(${variable}\\)`)
            );
        }
    });

    it('no spec imports Playwright directly: they all go through the fixtures', () => {
        for (const name of specs) {
            const source = readFileSync(join(DIR, name), 'utf8');
            expect(source, name).not.toMatch(/from '@playwright\/test'/);
        }
    });
});
