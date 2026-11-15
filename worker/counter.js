/**
 * The page-view counter: a Durable Object, so two visits that overlap can never overwrite each
 * other. KV had no compare-and-swap, and a read-modify-write there lost counts (issue #211).
 *
 * One object holds every counter (one row per page slug), and SQLite runs each statement of an
 * object one at a time, so `UPDATE ... SET value = value + 1` is atomic. The first read of a
 * slug seeds the row from the number KV held (the counter used to live there), once, before
 * anything else in the object runs.
 *
 * KV is still written every MIRROR_EVERY counts: it is no longer read, but it keeps a Worker
 * rolled back to an older version within a few counts of the truth.
 *
 * Workers-compatible: no Node built-ins.
 */

import { DurableObject } from 'cloudflare:workers';

/** How often the count is copied back to KV (see above). */
export const MIRROR_EVERY = 10;

export class Counter extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        ctx.blockConcurrencyWhile(async () => {
            this.sql.exec(
                'CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)'
            );
        });
    }

    /** @returns {number | null} the stored count, or null when the slug has no row yet */
    #stored(name) {
        const [row] = this.sql.exec('SELECT value FROM counters WHERE name = ?', name).toArray();
        return row ? row.value : null;
    }

    /** The count for a slug, creating its row from KV the first time. */
    async #count(name) {
        const stored = this.#stored(name);
        if (stored !== null) return stored;

        // blockConcurrencyWhile holds every other event until the seed is in, so two first
        // requests cannot both seed (and the second one would find the row anyway)
        await this.ctx.blockConcurrencyWhile(async () => {
            if (this.#stored(name) !== null) return;
            let raw;
            try {
                raw = await this.env.VIEWS_KV?.get(name);
            } catch (err) {
                // Starting from 0 would lose the history; refusing to count is the safer failure
                throw new Error(`could not read the KV count to seed ${name}`, { cause: err });
            }
            const seed = Number.parseInt(raw ?? '0', 10) || 0;
            this.sql.exec('INSERT OR IGNORE INTO counters (name, value) VALUES (?, ?)', name, seed);
        });
        return this.#stored(name) ?? 0;
    }

    /** @param {string} name - a page slug the Worker has already checked @returns {Promise<number>} */
    async read(name) {
        return this.#count(name);
    }

    /** Add one, atomically. @param {string} name @returns {Promise<number>} the new count */
    async increment(name) {
        await this.#count(name); // makes sure the row exists
        this.sql.exec('UPDATE counters SET value = value + 1 WHERE name = ?', name);
        const value = this.#stored(name);
        if (value % MIRROR_EVERY === 0) {
            try {
                await this.env.VIEWS_KV?.put(name, String(value));
            } catch {
                // The mirror is a convenience: the count is already saved
            }
        }
        return value;
    }
}
