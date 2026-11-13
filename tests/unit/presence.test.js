import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    initEdge,
    initPresence,
    parseCount,
    presenceText,
    presenceUrl,
} from '../../modules/edge.js';

describe('presenceUrl', () => {
    it("is the Worker's /presence over a secure socket", () => {
        expect(presenceUrl('/api', 'https://andernet.dev/status/')).toBe(
            'wss://andernet.dev/api/presence'
        );
        expect(
            presenceUrl('https://and3rn3t-portfolio.andernet.workers.dev', 'http://localhost:8000/')
        ).toBe('wss://and3rn3t-portfolio.andernet.workers.dev/presence');
    });

    it('is ws: only when the page itself is plain http (local development)', () => {
        expect(presenceUrl('/api', 'http://localhost:8000/')).toBe(
            'ws://localhost:8000/api/presence'
        );
    });
});

describe('parseCount and presenceText', () => {
    it('reads a count, and nothing else (the "pong" included)', () => {
        expect(parseCount('{"count":3}')).toBe(3);
        expect(parseCount('{"count":0}')).toBe(0);
        for (const bad of [
            'pong',
            '{"count":-1}',
            '{"count":1.5}',
            '{"count":"3"}',
            '{"count":1e9}',
            '{}',
            '',
        ]) {
            expect(parseCount(bad), bad).toBeNull();
        }
    });

    it('says "here now" only from two pages: one is just you', () => {
        expect(presenceText(1)).toBe('');
        expect(presenceText(0)).toBe('');
        expect(presenceText(null)).toBe('');
        expect(presenceText(2)).toBe('· 2 here now');
        expect(presenceText(41)).toBe('· 41 here now');
    });
});

describe('initPresence', () => {
    let sockets;
    let hidden;
    let stops;

    // Each test stops what it starts: a listener left on `document` would act in the next test
    const start = () => {
        const stop = initPresence();
        stops.push(stop);
        return stop;
    };

    class FakeSocket {
        constructor(url) {
            this.url = url;
            this.readyState = 0;
            this.send = vi.fn();
            sockets.push(this);
        }
        close() {
            this.readyState = 3;
            this.closed = true;
            queueMicrotask(() => this.onclose?.());
        }
        // The test's side of the wire
        open() {
            this.readyState = 1;
            this.onopen?.();
        }
        message(data) {
            this.onmessage?.({ data });
        }
        drop() {
            this.readyState = 3;
            this.onclose?.();
        }
    }

    const slot = () => document.querySelector('[data-presence]');
    const setHidden = value => {
        hidden = value;
        document.dispatchEvent(new Event('visibilitychange'));
    };

    beforeEach(() => {
        vi.useFakeTimers();
        sockets = [];
        stops = [];
        hidden = false;
        document.body.innerHTML = '<span data-presence hidden></span>';
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
        vi.stubGlobal('WebSocket', FakeSocket);
    });
    afterEach(() => {
        for (const stop of stops) stop();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        delete document.hidden;
    });

    // A browser policy can refuse the constructor outright (a SecurityError, say)
    it('does not throw when the browser refuses to build the socket, and does not retry', () => {
        vi.stubGlobal(
            'WebSocket',
            class {
                constructor() {
                    throw new Error('SecurityError');
                }
            }
        );
        expect(() => start()).not.toThrow();
        vi.advanceTimersByTime(600_000);
        expect(slot().hidden).toBe(true);

        // ...and it does not try again each time the tab is shown
        const attempts = vi.fn();
        vi.stubGlobal(
            'WebSocket',
            class {
                constructor() {
                    attempts();
                }
            }
        );
        setHidden(true);
        setHidden(false);
        expect(attempts).not.toHaveBeenCalled();
    });

    it('still loads the receipt when presence cannot start', async () => {
        document.body.innerHTML =
            '<span data-edge-widget hidden><a data-edge-receipt></a><span data-presence hidden></span></span>';
        vi.stubGlobal(
            'WebSocket',
            class {
                constructor() {
                    throw new Error('SecurityError');
                }
            }
        );
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => Response.json({ colo: 'ORD', version: 'abc1234' }))
        );
        vi.useRealTimers();
        await expect(initEdge()).resolves.toBeUndefined();
        expect(document.querySelector('[data-edge-receipt]').textContent).toMatch(
            /^Served from ORD/
        );
    });

    it('opens nothing on a page with no slot', () => {
        document.body.innerHTML = '';
        start();
        expect(sockets).toHaveLength(0);
    });

    it('shows the count from two, hides it at one, and ignores the pong', () => {
        start();
        sockets[0].open();
        sockets[0].message('{"count":3}');
        expect(slot().textContent).toBe('· 3 here now');
        expect(slot().hidden).toBe(false);

        sockets[0].message('pong');
        expect(slot().textContent).toBe('· 3 here now'); // a pong is not a count

        sockets[0].message('{"count":1}');
        expect(slot().hidden).toBe(true);
        expect(slot().textContent).toBe('');
    });

    // A tab nobody is looking at is not "here", and must hold nothing open
    it('opens no socket while the tab is hidden, and one when it becomes visible', () => {
        hidden = true;
        start();
        expect(sockets).toHaveLength(0);
        setHidden(false);
        expect(sockets).toHaveLength(1);
    });

    it('closes the socket when the tab is hidden and clears the line', () => {
        start();
        sockets[0].open();
        sockets[0].message('{"count":5}');
        setHidden(true);
        expect(sockets[0].closed).toBe(true);
        expect(slot().hidden).toBe(true);
    });

    it('ignores the late events of a socket it already replaced', async () => {
        start();
        const first = sockets[0];
        first.open();
        setHidden(true);
        setHidden(false);
        const second = sockets[1];
        second.open();
        second.message('{"count":4}');
        await vi.advanceTimersByTimeAsync(0); // the first socket's close arrives now
        first.message('{"count":99}');
        expect(slot().textContent).toBe('· 4 here now');
        expect(sockets).toHaveLength(2); // the stale close did not schedule a third
    });

    it('reconnects a dropped socket with a growing wait, and gives up after five tries', () => {
        start();
        sockets[0].drop();
        expect(sockets).toHaveLength(1);
        vi.advanceTimersByTime(1999);
        expect(sockets).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(2); // after 2 s

        sockets[1].drop();
        vi.advanceTimersByTime(3999);
        expect(sockets).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(3); // after 4 s more

        for (let n = 3; n < 6; n++) {
            sockets.at(-1).drop();
            vi.advanceTimersByTime(60_000);
        }
        sockets.at(-1).drop();
        vi.advanceTimersByTime(60_000);
        const total = sockets.length;
        vi.advanceTimersByTime(600_000);
        expect(sockets).toHaveLength(total); // five retries, then it stops asking
        expect(total).toBe(6);
    });

    it('starts the wait over after a connection that worked', () => {
        start();
        sockets[0].drop();
        vi.advanceTimersByTime(2000);
        sockets[1].open();
        sockets[1].drop();
        vi.advanceTimersByTime(1999);
        expect(sockets).toHaveLength(2);
        vi.advanceTimersByTime(1);
        expect(sockets).toHaveLength(3); // 2 s again, not 4
    });

    it('does not reconnect while hidden', () => {
        start();
        sockets[0].open();
        hidden = true; // hidden before the drop is noticed
        sockets[0].drop();
        vi.advanceTimersByTime(60_000);
        expect(sockets).toHaveLength(1);
    });

    it('sends a ping every 30 seconds while open', () => {
        start();
        sockets[0].open();
        vi.advanceTimersByTime(30_000);
        expect(sockets[0].send).toHaveBeenCalledWith('ping');
        vi.advanceTimersByTime(60_000);
        expect(sockets[0].send).toHaveBeenCalledTimes(3);
    });

    it('stops completely when told to: closes, clears the line, never reconnects', () => {
        const stop = start();
        sockets[0].open();
        sockets[0].message('{"count":2}');
        stop();
        expect(sockets[0].closed).toBe(true);
        expect(slot().hidden).toBe(true);
        setHidden(true);
        setHidden(false);
        vi.advanceTimersByTime(60_000);
        expect(sockets).toHaveLength(1);
    });
});
