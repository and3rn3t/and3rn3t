import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FORM_HTML = `
    <form id="guestbook-form">
        <input name="name" />
        <textarea name="message"></textarea>
        <button type="submit" disabled>Sign guestbook</button>
    </form>
    <div id="guestbook-entries"></div>
    <div id="guestbook-status"></div>
    <div id="turnstile-container"></div>`;

const jsonResponse = (body, status = 200) => Response.json(body, { status });

describe('guestbook form', () => {
    let turnstile;
    let postResponse;
    let fetchMock;
    let listeners;

    /** Load a fresh module (it keeps state in a singleton) and wire up the page. */
    async function setup() {
        vi.resetModules();
        document.body.className = '';
        delete document.documentElement.dataset.theme;
        document.body.innerHTML = FORM_HTML;

        turnstile = { render: vi.fn(() => 'widget-1'), reset: vi.fn(), remove: vi.fn() };
        globalThis.turnstile = turnstile;
        postResponse = () => jsonResponse({ ok: true, entry: entry() }, 201);
        fetchMock = vi.fn(async (_url, options = {}) =>
            options.method === 'POST' ? postResponse() : jsonResponse([])
        );
        vi.stubGlobal('fetch', fetchMock);

        const { guestbookManager } = await import('../../modules/guestbook.js');
        await guestbookManager.init();
    }

    const entry = () => ({ name: 'Alice', message: 'Hello', date: '2026-01-02T03:04:05.000Z' });
    const status = () => document.getElementById('guestbook-status').textContent;
    const button = () => document.querySelector('button[type="submit"]');
    const posts = () => fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST').length;
    const turnstileScript = () => document.head.querySelector('script[src*="turnstile"]');

    /** The widget finished loading; hand back the options Turnstile was rendered with. */
    function loadWidget() {
        turnstileScript().dispatchEvent(new Event('load'));
        return turnstile.render.mock.calls.at(-1)[1];
    }

    async function submit() {
        document.querySelector('[name="name"]').value = 'Alice';
        document.querySelector('[name="message"]').value = 'Hello';
        document.getElementById('guestbook-form').requestSubmit();
        await vi.waitFor(() => expect(button().disabled).toBe(false));
    }

    beforeEach(() => {
        // The module listens on document; drop those between tests so old instances stay quiet.
        listeners = [];
        const add = document.addEventListener.bind(document);
        vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, options) => {
            listeners.push([type, fn]);
            add(type, fn, options);
        });
    });

    afterEach(() => {
        for (const [type, fn] of listeners) document.removeEventListener(type, fn);
        for (const script of document.head.querySelectorAll('script[src*="turnstile"]')) {
            script.remove();
        }
        delete globalThis.turnstile;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('asks for a new captcha after the Worker rejects a submit', async () => {
        await setup();
        const options = loadWidget();
        options.callback('token-1');
        postResponse = () => jsonResponse({ error: 'invalid_captcha' }, 403);

        await submit();

        expect(status()).toMatch(/Captcha verification failed/);
        expect(turnstile.reset).toHaveBeenCalledWith('widget-1');

        // The spent token must not be sent again: without a fresh one the form asks for it.
        await submit();
        expect(status()).toBe('Please complete the captcha.');
        expect(posts()).toBe(1);

        options.callback('token-2');
        postResponse = () => jsonResponse({ ok: true, entry: entry() }, 201);
        await submit();
        expect(posts()).toBe(2);
        expect(status()).toMatch(/Thanks/);
    });

    it('asks for a new captcha after a network error', async () => {
        await setup();
        loadWidget().callback('token-1');
        postResponse = () => Promise.reject(new Error('offline'));

        await submit();

        expect(status()).toMatch(/Network error/);
        expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
        await submit();
        expect(status()).toBe('Please complete the captcha.');
        expect(posts()).toBe(1);
    });

    it('shows the generic error, not "network error", when the Worker answers with a non-JSON body', async () => {
        await setup();
        loadWidget().callback('token-1');
        postResponse = () => new Response('<html>Bad gateway</html>', { status: 502 });

        await submit();

        expect(status()).toBe('Something went wrong. Please try again.');
        expect(turnstile.reset).toHaveBeenCalled();
    });

    it.each([
        ['rate_limited', 429, /wait a minute/i],
        ['captcha_unconfigured', 503, /temporarily unavailable/i],
        ['something_new', 500, /Something went wrong/],
    ])('explains the Worker error %s', async (code, httpStatus, message) => {
        await setup();
        loadWidget().callback('token-1');
        postResponse = () => jsonResponse({ error: code }, httpStatus);

        await submit();

        expect(status()).toMatch(message);
    });

    it('adds a posted entry with a machine-readable datetime and resets the captcha', async () => {
        await setup();
        loadWidget().callback('token-1');

        await submit();

        const time = document.querySelector('#guestbook-entries time');
        expect(time.getAttribute('datetime')).toBe('2026-01-02T03:04:05.000Z');
        expect(turnstile.reset).toHaveBeenCalledWith('widget-1');
    });

    it('tells the visitor when the Turnstile script is blocked', async () => {
        await setup();

        turnstileScript().dispatchEvent(new Event('error'));

        expect(status()).toMatch(/ad blocker/i);
        expect(status()).toMatch(/message form/i);
        expect(turnstile.render).not.toHaveBeenCalled();
    });

    it('disables the form and keeps the explanation when the script is blocked', async () => {
        await setup();
        turnstileScript().dispatchEvent(new Event('error'));
        const explanation = status();
        expect(explanation).toMatch(/ad blocker/i);
        expect(button().disabled).toBe(true);

        // Pressing Enter in a field can still submit the form; it must not replace the message
        // with a request to complete a captcha that can never appear.
        document.querySelector('[name="name"]').value = 'Alice';
        document.querySelector('[name="message"]').value = 'Hello';
        document.getElementById('guestbook-form').requestSubmit();
        await Promise.resolve();

        expect(status()).toBe(explanation);
        expect(button().disabled).toBe(true);
        expect(posts()).toBe(0);
    });

    it('redraws the widget with the new theme when the site theme changes', async () => {
        await setup();
        loadWidget().callback('token-1');
        expect(turnstile.render.mock.calls[0][1].theme).toBe('light');

        document.documentElement.dataset.theme = 'dark';
        document.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: 'dark' } }));

        expect(turnstile.remove).toHaveBeenCalledWith('widget-1');
        expect(turnstile.render).toHaveBeenCalledTimes(2);
        expect(turnstile.render.mock.calls[1][1].theme).toBe('dark');

        // A redrawn widget starts without a token.
        await submit();
        expect(status()).toBe('Please complete the captcha.');
        expect(posts()).toBe(0);
    });

    it('ignores a theme change before the widget has loaded', async () => {
        await setup();
        delete globalThis.turnstile;

        document.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: 'dark' } }));

        expect(turnstile.render).not.toHaveBeenCalled();
    });
});
