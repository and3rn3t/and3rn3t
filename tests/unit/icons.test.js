/**
 * Every icon the site references must exist in icons/sprite.svg, otherwise it
 * renders as an empty box with no error. Add new icons to scripts/build-icons.mjs
 * and run `pnpm build:icons`.
 */
import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest runs from the repo root (import.meta.url isn't a file: URL under jsdom)
const read = path => readFileSync(resolve(process.cwd(), path), 'utf8');

const sprite = read('icons/sprite.svg');
const symbols = new Set([...sprite.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map(m => m[1]));

const sources = [
    'index.html',
    ...readdirSync(resolve(process.cwd(), 'modules'))
        .filter(f => f.endsWith('.js'))
        .map(f => `modules/${f}`),
];

// Direct references plus the name tables that feed icon() at runtime
const patterns = [
    /sprite\.svg#([a-z0-9-]+)/g,
    /\bicon\('([a-z0-9-]+)'/g,
    /\bicon: '([a-z0-9-]+)'/g,
    /\bstat\('([a-z0-9-]+)'/g,
    /TYPE_ICONS = \{[^}]*\}/g,
    /isDark \? '([a-z0-9-]+)' : '([a-z0-9-]+)'/g,
];

test('sprite defines every icon the markup and modules reference', () => {
    const missing = [];
    for (const file of sources) {
        const text = read(file);
        for (const pattern of patterns) {
            for (const match of text.matchAll(pattern)) {
                // TYPE_ICONS is a table: take the quoted values inside the block
                const names =
                    match.length === 1
                        ? [...match[0].matchAll(/: '([a-z0-9-]+)'/g)].map(m => m[1])
                        : match.slice(1);
                for (const name of names) {
                    if (!symbols.has(name)) missing.push(`${file}: ${name}`);
                }
            }
        }
    }
    expect(missing).toEqual([]);
});

test('sprite is not empty', () => {
    expect(symbols.size).toBeGreaterThan(20);
});
