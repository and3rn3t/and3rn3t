/**
 * The hero's seed. Seed 0 is the field the site has always drawn; any other seed moves the noise
 * field to a different place (a new landscape of the same kind) and fixes where the particles
 * start. The WASM core (assembly/hero-sim.ts `setSeed`) and the GPU field use the same offsets, so
 * one seed is one picture on both paths, which tests/unit/hero-seed.test.js checks against the
 * compiled binary. `offsets` and `mix` here must stay in step with that function.
 *
 * Off unless asked for: `?seed=` in the address (a permalink to one field) or the `hero-seed`
 * lab switch (the field changes each UTC day).
 */

/** How far the noise field can move, in noise units: far enough to be a new picture, near enough that f32 stays exact. */
const OFFSET_RANGE = 32;

const MS_PER_DAY = 86_400_000;

/**
 * Scramble a seed into 32 well-spread bits. Integer maths that WebAssembly's u32 reproduces exactly.
 * @param {number} value
 * @returns {number} an unsigned 32-bit integer
 */
export function mix(value) {
    let h = Math.imul(value >>> 0, 2654435761) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 2246822519) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    return h;
}

/**
 * Where a seed puts the noise field, and the state it leaves the particle generator in. Matches
 * `setSeed` in assembly/hero-sim.ts exactly (the offsets are exact in f32).
 * @param {number} seed - 0 is the default field
 * @returns {{ x: number, y: number, state: number }}
 */
export function seedLayout(seed) {
    if (!seed) {
        return { x: 0, y: 0, state: 0x9e3779b9 };
    }
    const first = mix(seed);
    const second = mix(first);
    return {
        x: ((first & 0xffff) / 65536) * OFFSET_RANGE,
        y: ((second & 0xffff) / 65536) * OFFSET_RANGE,
        state: (second | 1) >>> 0,
    };
}

/**
 * A small deterministic generator (xorshift32, the one the WASM core uses) for the GPU path's
 * starting positions. Returns f32-rounded numbers in [0, 1].
 * @param {number} seed - 0 is the default
 * @returns {() => number}
 */
export function seededRandom(seed) {
    let { state } = seedLayout(seed);
    return () => {
        state = (state ^ (state << 13)) >>> 0;
        state = (state ^ (state >>> 17)) >>> 0;
        state = (state ^ (state << 5)) >>> 0;
        // The same division, rounded to f32, as `rnd` in the WASM core
        return Math.fround((state & 0xffffff) / 0xffffff);
    };
}

/**
 * FNV-1a over the text, for a `?seed=` that is a word rather than a number.
 * @param {string} text
 * @returns {number}
 */
function hashText(text) {
    let h = 0x811c9dc5;
    for (const char of text) {
        h = Math.imul(h ^ char.codePointAt(0), 16777619) >>> 0;
    }
    return h;
}

/**
 * The seed for this visit. 0 (today's field, unchanged) unless a seed was asked for.
 * @param {{ search: string, now: number, daily: boolean }} input
 *   `daily` is the `hero-seed` lab switch: with no `?seed=`, use the UTC day
 * @returns {number} an unsigned 32-bit integer; 0 means the default field
 */
export function heroSeed({ search, now, daily }) {
    const asked = new URLSearchParams(search).get('seed');
    if (asked !== null && asked.trim() !== '') {
        const text = asked.trim().slice(0, 64);
        return /^\d{1,10}$/.test(text) ? Number(text) >>> 0 : hashText(text);
    }
    return daily ? Math.floor(now / MS_PER_DAY) + 1 : 0;
}
