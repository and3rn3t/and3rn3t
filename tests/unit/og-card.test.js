import { describe, expect, it } from 'vitest';
import * as ogCard from '../../scripts/og-card.mjs';
import { renderPortfolioCard } from '../../scripts/og-card.mjs';

const DATA = {
    repositories: [
        { name: 'a', stargazers_count: 3 },
        { name: 'b', stargazers_count: 4 },
        { name: 'c' }, // no star count at all
    ],
    contributions: { total: 4613 },
    languageBytes: {
        TypeScript: 500,
        Python: 300,
        HTML: 100,
        CSS: 50,
        Shell: 30,
        Rust: 15, // sixth: must not be shown
        Zig: 5,
    },
};

const parse = svg => new DOMParser().parseFromString(svg, 'image/svg+xml');
const texts = svg => [...parse(svg).querySelectorAll('text')].map(t => t.textContent.trim());

describe('renderPortfolioCard', () => {
    it('is a well-formed 1200x630 SVG', () => {
        const doc = parse(renderPortfolioCard(DATA));

        expect(doc.querySelector('parsererror')).toBeNull();
        const svg = doc.documentElement;
        expect(svg.tagName).toBe('svg');
        expect(svg.getAttribute('width')).toBe('1200');
        expect(svg.getAttribute('height')).toBe('630');
        expect(svg.getAttribute('viewBox')).toBe('0 0 1200 630');
    });

    it('shows the name, role and the three stats from the data', () => {
        const shown = texts(renderPortfolioCard(DATA));

        expect(shown).toContain('Matthew Anderson');
        expect(shown).toContain('Software Engineer · Deere & Company');
        expect(shown).toContain('3'); // repositories
        expect(shown).toContain('7'); // stars: 3 + 4 + (missing counts as 0)
        expect(shown).toContain('4,613'); // contributions, with a thousands separator
        expect(shown).toContain('Repositories');
        expect(shown).toContain('Stars');
        expect(shown).toContain('Contributions');
    });

    it('lists only the five biggest languages, largest first, as rounded percentages', () => {
        const shown = texts(renderPortfolioCard(DATA)).filter(t => /%$/.test(t));

        expect(shown).toEqual([
            expect.stringMatching(/^TypeScript\s+50%$/), // 500 of 1000 bytes
            expect.stringMatching(/^Python\s+30%$/),
            expect.stringMatching(/^HTML\s+10%$/),
            expect.stringMatching(/^CSS\s+5%$/),
            expect.stringMatching(/^Shell\s+3%$/),
        ]);
        expect(renderPortfolioCard(DATA)).not.toContain('Rust');
    });

    it('draws a language bar that never overflows its 480px track', () => {
        const doc = parse(renderPortfolioCard(DATA));
        const widths = [...doc.querySelectorAll('rect[height="16"]')].map(r =>
            Number(r.getAttribute('width'))
        );

        expect(widths).toHaveLength(5);
        expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(480);
        expect(widths[0]).toBeGreaterThan(widths[1]); // ordered by size
    });

    it('colours a known language with its own colour and an unknown one with the neutral fallback', () => {
        const doc = parse(
            renderPortfolioCard({ languageBytes: { TypeScript: 10, 'Made-Up Lang': 5 } })
        );
        // Largest first, so TypeScript is the first bar segment / legend dot and the unknown
        // language is the second. Check each element's own fill: the muted label text happens
        // to share the fallback colour, so a loose "svg contains this colour" can't tell.
        const bars = [...doc.querySelectorAll('rect[height="16"]')].map(r =>
            r.getAttribute('fill')
        );
        const dots = [...doc.querySelectorAll('circle[r="6"]')].map(c => c.getAttribute('fill'));

        expect(bars).toEqual(['#2b7489', '#6b7280']);
        expect(dots).toEqual(['#2b7489', '#6b7280']);
    });

    it('escapes language names, so markup in the data cannot break or inject into the SVG', () => {
        const hostile = `<script>alert(1)</script> & "quoted" 'single'`;
        const svg = renderPortfolioCard({ languageBytes: { [hostile]: 10 } });
        const doc = parse(svg);

        expect(doc.querySelector('parsererror')).toBeNull();
        expect(doc.querySelector('script')).toBeNull();
        expect(svg).not.toContain('<script>');
        expect(texts(svg).some(t => t.includes(hostile))).toBe(true); // shown as plain text
    });

    it.each([null, undefined, {}, { repositories: [], languageBytes: {} }])(
        'renders without throwing for empty data: %j',
        data => {
            const svg = renderPortfolioCard(data);

            expect(parse(svg).querySelector('parsererror')).toBeNull();
            expect(texts(svg)).toContain('0'); // zero repositories, stars and contributions
        }
    );

    it('is deterministic: the same data renders the same SVG', () => {
        expect(renderPortfolioCard(DATA)).toBe(renderPortfolioCard(structuredClone(DATA)));
    });

    it('only exposes the portfolio card (the per-project cards were removed)', () => {
        expect(Object.keys(ogCard)).toEqual(['renderPortfolioCard']);
    });
});
