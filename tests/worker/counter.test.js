/**
 * The page-view counter (worker/counter.js) on a real SQLite database (node:sqlite stands in for
 * the object's storage), and the /views handler's use of it. Overlapping visits must never lose
 * a count: that is what the KV counter did (#211).
 */
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { Counter, MIRROR_EVERY } from '../../worker/counter.js';
import { handleViewsRequest } from '../../worker/engagement.js';

/** The slice of a Durable Object's ctx that Counter uses, over an in-memory SQLite database. */
function makeCtx() {
    const db = new DatabaseSync(':memory:');
    // Events held by blockConcurrencyWhile run one after another, as in the runtime
    let chain = Promise.resolve();
    return {
        storage: {
            sql: {
                exec(query, ...params) {
                    const statement = db.prepare(query);
                    const rows = /^\s*SELECT/i.test(query) ? statement.all(...params) : [];
                    if (!rows.length && !/^\s*SELECT/i.test(query)) statement.run(...params);
                    return { toArray: () => rows };
                },
            },
        },
        blockConcurrencyWhile(fn) {
            const run = chain.then(fn);
            chain = run.catch(() => {});
            return run;
        },
    };
}

/** A KV with one value, whose reads take a moment (so overlapping first requests really overlap). */
function makeKV(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        store,
        get: vi.fn(async key => {
            await new Promise(resolve => setTimeout(resolve, 5));
            return store.get(key) ?? null;
        }),
        put: vi.fn(async (key, value) => void store.set(key, value)),
    };
}

async function makeCounter(kv = makeKV()) {
    const counter = new Counter(makeCtx(), { VIEWS_KV: kv });
    await counter.ctx?.blockConcurrencyWhile?.(async () => {}); // let the table exist
    return counter;
}

describe('Counter', () => {
    it('starts from the number KV held, once', async () => {
        const kv = makeKV({ home: '2840' });
        const counter = await makeCounter(kv);
        expect(await counter.read('home')).toBe(2840);
        expect(await counter.increment('home')).toBe(2841);
        expect(await counter.read('home')).toBe(2841);
        expect(kv.get).toHaveBeenCalledTimes(1);
    });

    it('starts at 0 when KV has nothing', async () => {
        const counter = await makeCounter();
        expect(await counter.increment('home')).toBe(1);
    });

    it('never loses a count when visits overlap', async () => {
        const kv = makeKV({ home: '41' });
        const counter = await makeCounter(kv);

        const results = await Promise.all(
            Array.from({ length: 200 }, () => counter.increment('home'))
        );

        expect(results.toSorted((a, b) => a - b)).toEqual(
            Array.from({ length: 200 }, (_, index) => 42 + index) // every count handed out once
        );
        expect(await counter.read('home')).toBe(241);
        expect(kv.get).toHaveBeenCalledTimes(1); // overlapping first visits seed it once
    });

    it('counts each slug on its own', async () => {
        const counter = await makeCounter();
        await counter.increment('home');
        await counter.increment('home');
        expect(await counter.increment('about')).toBe(1);
    });

    it('copies the count back to KV every tenth count, and not on the others', async () => {
        const kv = makeKV({ home: '5' });
        const counter = await makeCounter(kv);
        for (let count = 6; count <= 20; count++) await counter.increment('home');
        expect(MIRROR_EVERY).toBe(10);
        expect(kv.put.mock.calls).toEqual([
            ['home', '10'],
            ['home', '20'],
        ]);
    });

    it('still counts when the KV copy fails', async () => {
        const kv = makeKV({ home: '9' });
        kv.put.mockRejectedValue(new Error('KV 429'));
        const counter = await makeCounter(kv);
        expect(await counter.increment('home')).toBe(10);
    });

    it('refuses to count, rather than restart from 0, when KV cannot be read to seed it', async () => {
        const kv = makeKV({ home: '2840' });
        kv.get.mockRejectedValueOnce(new Error('KV down'));
        const counter = await makeCounter(kv);
        await expect(counter.increment('home')).rejects.toThrow(/could not read the KV count/);
        // and once KV answers, it still has the history
        expect(await counter.increment('home')).toBe(2841);
    });
});

describe('/views with the COUNTER binding', () => {
    const request = (method, query = '?page=home') =>
        new Request(`https://andernet.dev/api/views${query}`, {
            method,
            headers: { Origin: 'https://andernet.dev' },
        });

    /** A namespace whose one object is `counter`. */
    const namespace = counter => ({ idFromName: vi.fn(name => name), get: vi.fn(() => counter) });

    it('counts through the object, and does not touch the KV count itself', async () => {
        const counter = { increment: vi.fn(async () => 7), read: vi.fn(async () => 6) };
        const kv = makeKV({ home: '1' });
        const env = { COUNTER: namespace(counter), VIEWS_KV: kv };

        const posted = await handleViewsRequest(request('POST'), env);
        expect(await posted.json()).toEqual({ page: 'home', views: 7 });
        const got = await handleViewsRequest(request('GET'), env);
        expect(await got.json()).toEqual({ page: 'home', views: 6 });

        expect(counter.increment).toHaveBeenCalledWith('home');
        expect(kv.get).not.toHaveBeenCalled();
        expect(kv.put).not.toHaveBeenCalled();
    });

    it('does not reach the object for a page it does not count', async () => {
        const counter = { increment: vi.fn(), read: vi.fn() };
        const response = await handleViewsRequest(request('POST', '?page=nope'), {
            COUNTER: namespace(counter),
        });
        expect(response.status).toBe(400);
        expect(counter.increment).not.toHaveBeenCalled();
    });

    it('answers 503 (and keeps the KV count out of it) when the object fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const counter = {
            increment: vi.fn(async () => {
                throw new Error('overloaded');
            }),
        };
        const kv = makeKV({ home: '1' });
        const response = await handleViewsRequest(request('POST'), {
            COUNTER: namespace(counter),
            VIEWS_KV: kv,
        });
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: 'counter_unavailable' });
        expect(kv.put).not.toHaveBeenCalled();
    });

    it('still answers 405 for other methods', async () => {
        const response = await handleViewsRequest(request('DELETE'), {
            COUNTER: namespace({}),
        });
        expect(response.status).toBe(405);
    });
});
