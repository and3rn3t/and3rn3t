/**
 * The colours outside the stylesheet (the browser's bar, the installed app, the share card) are
 * copies of the design tokens in styles/core.css. They can't reference a custom property, so a
 * test keeps them equal.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHead } from '../../scripts/templates/chrome.mjs';
import { renderPortfolioCard } from '../../scripts/og-card.mjs';

const read = file => readFileSync(file, 'utf8');

/** [light, dark] values of a `--name: light-dark(a, b)` token in core.css. */
const token = name => {
    const match = read('styles/core.css').match(
        new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, 'i')
    );
    if (!match) throw new Error(`--${name} is not a light-dark() hex token in core.css`);
    return [match[1].toLowerCase(), match[2].toLowerCase()];
};

const themeColours = html =>
    Object.fromEntries(
        [
            ...html.matchAll(
                /<meta name="theme-color" media="\(prefers-color-scheme: (\w+)\)" content="(#\w+)"/g
            ),
        ].map(match => [match[1], match[2].toLowerCase()])
    );

describe('the browser bar colour (theme-color)', () => {
    const [light, dark] = token('surface');

    it('is the page surface, in the home page, the generated pages and the offline page', () => {
        const generated = renderHead({ title: 'T', description: 'D', path: '/x/' });
        for (const [name, html] of [
            ['index.html', read('index.html')],
            ['a generated page', generated],
            ['offline.html', read('offline.html')],
        ]) {
            expect(themeColours(html), name).toEqual({ light, dark });
        }
    });

    it("is what the theme switch writes into the page's meta tags", () => {
        const source = read('modules/theme.js');
        expect(source).toContain(`light: '${light}'`);
        expect(source).toContain(`dark: '${dark}'`);
    });
});

describe('the installed app (manifest.json)', () => {
    it('opens on the light surface rather than white or the old green', () => {
        const manifest = JSON.parse(read('manifest.json'));
        const [light] = token('surface');
        expect(manifest.background_color.toLowerCase()).toBe(light);
        expect(manifest.theme_color.toLowerCase()).toBe(light);
    });
});

describe('the share card', () => {
    const svg = renderPortfolioCard({
        repositories: [{ stargazers_count: 1 }],
        contributions: { total: 10 },
        languageBytes: { TypeScript: 10 },
    });

    it('uses the dark theme tokens for surface, text, muted text, lines and the accent', () => {
        const colours = new Set(
            [...svg.matchAll(/#[0-9a-f]{6}/gi)].map(match => match[0].toLowerCase())
        );
        expect(colours.has(token('surface')[1])).toBe(true);
        expect(colours.has(token('text')[1])).toBe(true);
        expect(colours.has(token('muted')[1])).toBe(true);
        expect(colours.has(token('border')[1])).toBe(true);
        expect(colours.has(token('accent')[1])).toBe(true);
    });

    it('no longer carries the old green or navy background', () => {
        expect(svg).not.toContain('#16a34a');
        expect(svg).not.toContain('#0d1117');
    });

    it('sets its labels in the monospace face the generator embeds', () => {
        expect(svg).toContain('class="mono"');
        expect(read('scripts/generate-og.mjs')).toContain('text.mono');
    });
});

describe('regenerating the share card', () => {
    it('is triggered by a change to any font the generator embeds', () => {
        const generator = read('scripts/generate-og.mjs');
        const workflow = read('.github/workflows/update-github-data.yml');
        const embedded = [...generator.matchAll(/'fonts',\s*'([^']+)'/g)].map(m => `fonts/${m[1]}`);
        expect(embedded.length).toBeGreaterThanOrEqual(2);
        for (const font of embedded) {
            expect(workflow, `${font} is embedded in the card but not hashed`).toContain(font);
        }
    });
});
