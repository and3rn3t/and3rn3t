/**
 * Prerender on hover: the speculation rules are the same on every page, a prerendered page does
 * not count as a visit until it is opened, and the policy lets the inline rules run.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPECULATION_RULES } from '../../scripts/templates/chrome.mjs';
import { buildCsp, cspHash, inlineHashes } from '../../scripts/zone-headers.mjs';
import { whenActivated } from '../../modules/utils/activation.js';

const rulesIn = html => {
    const head = html.slice(0, html.indexOf('</head>'));
    return [...head.matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)].map(match =>
        JSON.parse(match[1])
    );
};

describe('the speculation rules', () => {
    it('prerender project and post pages when the link is hovered, and nothing else', () => {
        expect(SPECULATION_RULES.prerender).toHaveLength(1);
        const [rule] = SPECULATION_RULES.prerender;
        expect(rule.eagerness).toBe('moderate');
        expect(rule.where.href_matches).toEqual(['/projects/*', '/posts/*']);
        expect(Object.keys(SPECULATION_RULES)).toEqual(['prerender']); // no prefetch of its own
    });

    it.each([
        'index.html',
        'projects/health/index.html',
        'posts/how-this-site-works/index.html',
        'status/index.html',
        '404.html',
    ])('are in the head of %s, identical to the shared copy', file => {
        expect(rulesIn(readFileSync(file, 'utf8'))).toEqual([SPECULATION_RULES]);
    });

    it('are hashed into the policy like any inline script, so a change needs `pnpm zone --apply`', () => {
        const html = readFileSync('index.html', 'utf8');
        const [rules] = [...html.matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)];
        expect(buildCsp(inlineHashes('.'))).toContain(cspHash(rules[1]));
    });
});

describe('whenActivated', () => {
    afterEach(() => {
        delete document.prerendering;
    });

    it('resolves at once for a page that is open', async () => {
        await expect(whenActivated()).resolves.toBeUndefined();
    });

    it('waits for a prerendered page to be opened', async () => {
        document.prerendering = true;
        let opened = false;
        const waiting = whenActivated().then(() => {
            opened = true;
        });
        await Promise.resolve();
        expect(opened).toBe(false);

        document.prerendering = false;
        document.dispatchEvent(new Event('prerenderingchange'));
        await waiting;
        expect(opened).toBe(true);
    });
});

describe('the view counter on a prerendered page', () => {
    afterEach(() => {
        delete document.prerendering;
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('does not count a visit until the page is opened', async () => {
        const fetchMock = vi.fn(async () => Response.json({ views: 5 }));
        vi.stubGlobal('fetch', fetchMock);
        document.prerendering = true;
        document.body.innerHTML = '<span data-view-widget hidden><b data-view-count></b></span>';

        const { viewCounter } = await import('../../modules/views.js');
        const started = viewCounter.init();
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(fetchMock).not.toHaveBeenCalled();

        document.prerendering = false;
        document.dispatchEvent(new Event('prerenderingchange'));
        await started;
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(document.querySelector('[data-view-count]').textContent).toBe('5');
    });
});
