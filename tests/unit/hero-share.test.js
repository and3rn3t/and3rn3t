import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    GUST_INTERVAL_MS,
    MIN_SHARING,
    REMOTE_STRENGTH,
    encodeGust,
    parseShareMessage,
    startSharedField,
} from '../../modules/hero-share.js';

describe('encodeGust', () => {
    it('turns -1..1 on each axis into the 0..255 cells the Worker takes', () => {
        expect(encodeGust(-1, -1)).toBe('g 0 0');
        expect(encodeGust(1, 1)).toBe('g 255 255');
        expect(encodeGust(0, 0)).toBe('g 128 128');
    });

    it.each([
        [1.01, 0],
        [0, -1.5],
        [NaN, 0],
        [0, Infinity],
        [undefined, 0],
    ])('is null for a pointer that is not over the hero: (%s, %s)', (x, y) => {
        expect(encodeGust(x, y)).toBeNull();
    });

    it('produces what the Worker accepts: "g" and two whole numbers up to 255', () => {
        for (const value of [-1, -0.37, 0, 0.5, 1]) {
            expect(encodeGust(value, -value)).toMatch(
                /^g (?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]) (?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])$/
            );
        }
    });
});

describe('parseShareMessage', () => {
    it('reads a gust back to -1..1', () => {
        const { gust } = parseShareMessage('{"g":[0,255]}');
        expect(gust).toEqual({ x: -1, y: 1 });
    });

    it('reads the sharing count and the refusal', () => {
        expect(parseShareMessage('{"count":4,"sharing":3}')).toEqual({ sharing: 3 });
        expect(parseShareMessage('{"share":false}')).toEqual({ refused: true });
    });

    it.each([
        ['not json', 'pong'],
        ['a gust that is not two cells', '{"g":[1]}'],
        ['a cell out of range', '{"g":[1,256]}'],
        ['a cell that is not whole', '{"g":[1.5,2]}'],
        ['text cells', '{"g":["1","2"]}'],
        ['a count that is not a number', '{"sharing":"many"}'],
        ['a negative count', '{"sharing":-1}'],
    ])('says nothing for %s', (_name, data) => {
        expect(parseShareMessage(data)).toEqual({});
    });
});

describe('startSharedField', () => {
    let hero;
    let canvas;
    let handlers;
    let sent;
    let clock;
    let leave;

    const presence = () => ({
        onMessage: fn => {
            handlers.message = fn;
            return () => delete handlers.message;
        },
        onOpen: fn => {
            handlers.open = fn;
            return () => delete handlers.open;
        },
        send: text => {
            sent.push(text);
            return true;
        },
        now: () => clock,
    });
    const move = (clientX, clientY) =>
        globalThis.dispatchEvent(Object.assign(new Event('pointermove'), { clientX, clientY }));

    beforeEach(() => {
        handlers = {};
        sent = [];
        clock = 10_000;
        hero = { nudge: vi.fn() };
        canvas = {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }),
        };
        leave = startSharedField(hero, canvas, presence());
    });
    afterEach(() => leave?.());

    it('opts in when the socket opens', () => {
        handlers.open();
        expect(sent).toEqual(['share']);
    });

    it('sends nothing while fewer than two pages have opted in', () => {
        handlers.message(JSON.stringify({ count: 1, sharing: 1 }));
        move(100, 50);
        expect(sent).toEqual([]);
        handlers.message(JSON.stringify({ count: 2, sharing: MIN_SHARING }));
        move(100, 50);
        expect(sent).toEqual(['g 128 128']);
    });

    it('sends nothing before it has heard how many are sharing', () => {
        move(100, 50);
        expect(sent).toEqual([]);
    });

    it('sends at most one position per interval', () => {
        handlers.message(JSON.stringify({ sharing: 2 }));
        move(0, 0);
        clock += GUST_INTERVAL_MS - 1;
        move(200, 100);
        expect(sent).toEqual(['g 0 0']);
        clock += 1;
        move(200, 100);
        expect(sent).toEqual(['g 0 0', 'g 255 255']);
    });

    it('sends nothing for a pointer that is not over the hero', () => {
        handlers.message(JSON.stringify({ sharing: 2 }));
        move(300, 50);
        move(100, -20);
        expect(sent).toEqual([]);
    });

    it('sends nothing from a tab that is hidden', () => {
        handlers.message(JSON.stringify({ sharing: 2 }));
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        move(100, 50);
        handlers.message(JSON.stringify({ g: [10, 10] }));
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        expect(sent).toEqual([]);
        expect(hero.nudge).not.toHaveBeenCalled();
    });

    it("pulls the hero toward another visitor's gust, a little less than its own pointer", () => {
        handlers.message(JSON.stringify({ g: [255, 0] }));
        expect(hero.nudge).toHaveBeenCalledWith(1, -1, REMOTE_STRENGTH);
        expect(REMOTE_STRENGTH).toBeLessThan(1);
    });

    it('ignores a gust that is not well formed', () => {
        handlers.message('{"g":[999,0]}');
        handlers.message('garbage');
        expect(hero.nudge).not.toHaveBeenCalled();
    });

    it('takes no further part once the Worker says the room is full', () => {
        handlers.message(JSON.stringify({ sharing: 5 }));
        handlers.message(JSON.stringify({ share: false }));
        move(100, 50);
        handlers.message(JSON.stringify({ g: [10, 10] }));
        expect(sent).toEqual([]);
        expect(hero.nudge).not.toHaveBeenCalled();
    });

    it('does not fail on a hero without nudge', () => {
        leave();
        leave = startSharedField({}, canvas, presence());
        expect(() => handlers.message(JSON.stringify({ g: [1, 1] }))).not.toThrow();
    });

    it('stops listening when it leaves', () => {
        handlers.message(JSON.stringify({ sharing: 2 }));
        leave();
        move(100, 50);
        expect(sent).toEqual([]);
        expect(handlers.message).toBeUndefined();
        leave = undefined;
    });
});
