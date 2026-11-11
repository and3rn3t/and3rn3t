/**
 * HTML utility tests — escapeHtml / safeUrl. (Hostile data in rendered pages is covered by
 * project-page.test.js and prerender.test.js.)
 */
import { test, expect } from 'vitest';
import { escapeHtml, safeUrl } from '../../modules/utils/html.js';

test('escapeHtml escapes markup and quote characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
        '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
});

test('escapeHtml returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
});

test('safeUrl allows http(s) and rejects unsafe schemes', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com')).toBe('http://example.com');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<b>x</b>')).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl(null)).toBeNull();
});
