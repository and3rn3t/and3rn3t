import { describe, expect, it } from 'vitest';
import {
    articleText,
    bulletLines,
    collectBlocks,
    describeAvailability,
    downloadLabel,
    sourceLanguage,
} from '../../modules/post-tools.js';

const prose = html => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
};

describe('collectBlocks', () => {
    it('takes paragraphs, headings and list items in order', () => {
        const blocks = collectBlocks(
            prose('<h3>Start</h3><p>One <a href="#">link</a> here.</p><ul><li>Item</li></ul>')
        );
        expect(blocks).toEqual([
            { tag: 'h3', text: 'Start' },
            { tag: 'p', text: 'One link here.' },
            { tag: 'li', text: 'Item' },
        ]);
    });

    it('leaves out code, tables, figures and hidden parts', () => {
        const blocks = collectBlocks(
            prose(
                '<p>Keep</p><pre><code>const x = 1;</code></pre><table><tr><td><p>cell</p></td></tr></table>' +
                    '<figure><p>caption</p></figure><div aria-hidden="true"><p>hidden</p></div>'
            )
        );
        expect(blocks.map(block => block.text)).toEqual(['Keep']);
    });

    it('counts a list item once, through what it contains', () => {
        const blocks = collectBlocks(
            prose('<ul><li><p>Inside</p></li><li>Plain<ul><li>Nested</li></ul></li></ul>')
        );
        expect(blocks.map(block => block.text)).toEqual(['Inside', 'Nested']);
    });

    it('collapses whitespace and skips empty blocks', () => {
        const blocks = collectBlocks(prose('<p>  a\n   b </p><p>   </p>'));
        expect(blocks).toEqual([{ tag: 'p', text: 'a b' }]);
        expect(articleText([{ text: 'a' }, { text: 'b' }])).toBe('a\n\nb');
    });
});

describe('sourceLanguage', () => {
    it.each([
        ['en', 'en'],
        ['en-US', 'en'],
        ['DE-at', 'de'],
        ['', 'en'],
        ['not a language', 'en'],
    ])('reads %j as %s', (lang, expected) => {
        expect(sourceLanguage({ documentElement: { lang } })).toBe(expected);
    });
});

describe('describeAvailability', () => {
    it.each([
        ['available', { usable: true, download: false }],
        ['downloadable', { usable: true, download: true }],
        ['downloading', { usable: true, download: true }],
        ['unavailable', { usable: false, download: false }],
        [undefined, { usable: false, download: false }],
    ])('%s', (value, expected) => {
        expect(describeAvailability(value)).toEqual(expected);
    });
});

describe('bulletLines', () => {
    it('strips bullet marks and numbering, and drops empty lines', () => {
        expect(bulletLines('- One\n* Two\n• Three\n1. Four\n2) Five\n\n  \nplain')).toEqual([
            'One',
            'Two',
            'Three',
            'Four',
            'Five',
            'plain',
        ]);
    });
});

describe('downloadLabel', () => {
    it('shows a rounded percentage and keeps it in range', () => {
        expect(downloadLabel(0.426)).toBe('Downloading the model to this device… 43%');
        expect(downloadLabel(7)).toContain('100%');
        expect(downloadLabel(-1)).toContain('0%');
        expect(downloadLabel(undefined)).toContain('0%');
    });
});
