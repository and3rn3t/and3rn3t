/**
 * HTML utility tests — escapeHtml / safeUrl, plus a render check that
 * the project modal treats repo data as inert text.
 */
import { test, expect, vi } from 'vitest';
import { escapeHtml, safeUrl } from '../../modules/utils/html.js';

vi.mock('../../modules/debug.js', () => ({
    debug: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

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

test('project modal renders hostile repo data as inert text', async () => {
    const { projectModal } = await import('../../modules/project-modal.js');
    const container = document.createElement('div');
    container.innerHTML = projectModal.renderBody({
        displayName: '<img src=x onerror="globalThis.pwned=1">',
        description: '<script>globalThis.pwned=1</script>',
        technologies: ['<b>bold</b>'],
        highlights: ['<i>hi</i>'],
        status: 'Active "><svg onload=alert(1)>',
        stars: 3,
        homepage: 'javascript:alert(1)',
        htmlUrl: 'https://github.com/and3rn3t/x',
    });

    expect(container.querySelector('img, script, svg:not(.icon), b, i')).toBeNull();
    expect(container.querySelector('.project-modal-title').textContent).toContain('<img');
    expect(container.querySelector('.project-link.live')).toBeNull();
    expect(container.querySelector('.project-link').getAttribute('href')).toBe(
        'https://github.com/and3rn3t/x'
    );
});
