import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { viewCounter } from '../../modules/views.js';

const methodsCalled = fetchMock => fetchMock.mock.calls.map(([, options]) => options.method);

describe('view counter', () => {
    let fetchMock;

    beforeEach(() => {
        sessionStorage.clear();
        document.body.innerHTML =
            '<span class="view-count-widget" hidden><span data-view-count>0</span> views</span>';
        fetchMock = vi.fn(async () => Response.json({ page: 'home', views: 1234 }));
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('counts the first load of a session with a POST and shows the total', async () => {
        await viewCounter.init();

        expect(methodsCalled(fetchMock)).toEqual(['POST']);
        expect(document.querySelector('[data-view-count]').textContent).toBe('1,234');
        expect(document.querySelector('.view-count-widget').hidden).toBe(false);
    });

    it('only reads the total on later loads in the same session', async () => {
        await viewCounter.init();
        await viewCounter.init();
        await viewCounter.init();

        expect(methodsCalled(fetchMock)).toEqual(['POST', 'GET', 'GET']);
        expect(document.querySelector('[data-view-count]').textContent).toBe('1,234');
    });

    it('does not mark the session as counted when the Worker refuses the POST', async () => {
        fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
        await viewCounter.init();
        await viewCounter.init();

        expect(methodsCalled(fetchMock)).toEqual(['POST', 'POST']); // retried, not skipped
    });

    it('does not mark the session as counted when the request fails', async () => {
        fetchMock.mockRejectedValueOnce(new Error('offline'));
        await viewCounter.init();
        await viewCounter.init();

        expect(methodsCalled(fetchMock)).toEqual(['POST', 'POST']);
    });

    it('keeps working when sessionStorage is blocked', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });

        await viewCounter.init();
        await viewCounter.init();

        expect(methodsCalled(fetchMock)).toEqual(['POST', 'POST']); // counts every load, as before
        expect(document.querySelector('[data-view-count]').textContent).toBe('1,234');
    });
});
