/**
 * The logo is drawn once, in scripts/brand-mark.mjs, and written to favicon.svg and icons/ by
 * `pnpm build:brand`. These tests fail when a checked-in file is not what the script writes, when
 * a colour drifts from the design tokens, or when the manifest names an icon nobody builds.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTES, PNG_FILES, SVG_FILES, renderIcon } from '../../scripts/brand-mark.mjs';

const read = file => readFileSync(file, 'utf8');

/** [light, dark] values of a `--name: light-dark(a, b)` token in core.css. */
const token = name => {
    const match = read('styles/core.css').match(
        new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i')
    );
    if (!match) throw new Error(`--${name} is not a light-dark() hex token in core.css`);
    return [match[1].toLowerCase(), match[2].toLowerCase()];
};

describe('the logo files', () => {
    it.each(Object.entries(SVG_FILES))('%s is what pnpm build:brand writes', (path, svg) => {
        expect(read(path)).toBe(svg);
    });

    it.each(Object.keys(PNG_FILES))('%s is checked in', path => {
        expect(existsSync(path)).toBe(true);
    });

    it('are the only icons the manifest lists', () => {
        const built = new Set([...Object.keys(SVG_FILES), ...Object.keys(PNG_FILES)]);
        const { icons } = JSON.parse(read('manifest.json'));
        for (const { src } of icons) expect(built.has(src.slice(1)), src).toBe(true);
    });
});

describe('the logo colours', () => {
    const [lightSurface, darkSurface] = token('surface');
    const [lightText, darkText] = token('text');
    const [lightAccent, darkAccent] = token('accent');
    const [, darkAccentContrast] = token('accent-contrast');

    it('are the design tokens in styles/core.css', () => {
        expect(PALETTES.site).toEqual({ tile: darkSurface, mark: darkText, accent: darkAccent });
        expect(PALETTES.light).toEqual({
            tile: lightSurface,
            mark: lightText,
            accent: lightAccent,
        });
        expect(PALETTES.agent).toEqual({
            tile: darkAccent,
            mark: darkAccentContrast,
            accent: darkAccentContrast,
        });
    });
});

describe('renderIcon', () => {
    it('draws a full-bleed tile for the icons a platform crops', () => {
        expect(renderIcon({ palette: 'site', shape: 'square' })).not.toContain('rx=');
        expect(renderIcon({ palette: 'site' })).toContain('rx="14"');
    });

    it('shrinks the mark about the centre for a maskable icon', () => {
        expect(renderIcon({ palette: 'site', scale: 0.5 })).toContain(
            'transform="translate(16 16) scale(0.5)"'
        );
    });

    it('uses the heavier cut only when asked', () => {
        expect(renderIcon({ palette: 'site', cut: 'heavy' })).toContain('stroke-width="8.5"');
        expect(renderIcon({ palette: 'site' })).toContain('stroke-width="6.5"');
    });
});
