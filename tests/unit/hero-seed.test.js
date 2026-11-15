import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { heroSeed, mix, seedLayout, seededRandom } from '../../modules/utils/hero-seed.js';

/** The compiled core, instantiated the way modules/wasm/hero-sim.js does. */
async function loadCore() {
    const bytes = readFileSync(join(import.meta.dirname, '../../modules/wasm/hero-core.wasm'));
    const { instance } = await WebAssembly.instantiate(bytes, {
        env: {
            abort() {
                throw new Error('wasm abort');
            },
        },
    });
    return instance.exports;
}

const particles = (core, n) =>
    Array.from(new Float32Array(core.memory.buffer, core.particlePtr(), n * 4));

describe('heroSeed', () => {
    const now = Date.UTC(2026, 10, 15, 13, 0, 0);

    it('is 0, the field the site always drew, unless asked for', () => {
        expect(heroSeed({ search: '', now, daily: false })).toBe(0);
        expect(heroSeed({ search: '?utm_source=x&seed=', now, daily: false })).toBe(0);
    });

    it('uses the UTC day with the daily switch, and changes at UTC midnight', () => {
        const day = heroSeed({ search: '', now, daily: true });
        expect(day).toBeGreaterThan(0);
        expect(heroSeed({ search: '', now: now + 3_600_000 * 10, daily: true })).toBe(day);
        expect(heroSeed({ search: '', now: Date.UTC(2026, 10, 16), daily: true })).toBe(day + 1);
    });

    it('?seed= wins, as a number or as a word, and needs no switch', () => {
        expect(heroSeed({ search: '?seed=42', now, daily: true })).toBe(42);
        expect(heroSeed({ search: '?seed=4294967295', now, daily: false })).toBe(4294967295);
        const word = heroSeed({ search: '?seed=flow', now, daily: false });
        expect(word).toBeGreaterThan(0);
        expect(heroSeed({ search: '?seed=flow', now, daily: true })).toBe(word);
        expect(heroSeed({ search: '?seed=flaw', now, daily: false })).not.toBe(word);
    });

    it('?seed=0 is the default field even with the daily switch on', () => {
        expect(heroSeed({ search: '?seed=0', now, daily: true })).toBe(0);
    });
});

describe('the seed and the compiled core agree', () => {
    it('seed 0 is the field the site always drew (pinned from the binary before setSeed existed)', async () => {
        const core = await loadCore();
        core.setSeed(0);
        core.init(3, 100, 100);
        expect(particles(core, 3).slice(0, 6)).toEqual(
            [
                4.794460773468018, 18.09882164001465, 4.794460773468018, 18.09882164001465,
                72.48417663574219, 51.42930603027344,
            ].map(Math.fround)
        );
        core.setPointer(0, 0, 0);
        core.step(1.5, 1.4);
        expect(particles(core, 3).slice(0, 2)).toEqual(
            [3.4031291007995605, 17.94327163696289].map(Math.fround)
        );
    });

    it('puts the noise field where seedLayout says, for any seed', async () => {
        const core = await loadCore();
        for (const seed of [1, 2, 42, 20407, 123456789, 4294967295, mix(7)]) {
            core.setSeed(seed);
            const layout = seedLayout(seed);
            expect(core.seedOffsetX()).toBe(Math.fround(layout.x));
            expect(core.seedOffsetY()).toBe(Math.fround(layout.y));
        }
    });

    it('starts the particles where the GPU path will, for any seed', async () => {
        const core = await loadCore();
        for (const seed of [0, 1, 20407, 4294967295]) {
            core.setSeed(seed);
            core.init(50, 100, 80);
            const random = seededRandom(seed);
            const expected = [];
            for (let i = 0; i < 50; i++) {
                const x = Math.fround(random() * 100);
                const y = Math.fround(random() * 80);
                expected.push(x, y, x, y);
            }
            expect(particles(core, 50)).toEqual(expected);
        }
    });

    it('one seed is one picture, and different seeds are different pictures', async () => {
        const core = await loadCore();
        const run = seed => {
            core.setSeed(seed);
            core.init(40, 200, 200);
            core.setPointer(0, 0, 0);
            for (let i = 0; i < 20; i++) core.step(i * 0.1, 1.4);
            return particles(core, 40);
        };
        expect(run(20407)).toEqual(run(20407));
        expect(run(20407)).not.toEqual(run(20408));
        expect(run(0)).not.toEqual(run(20407));
    });
});
