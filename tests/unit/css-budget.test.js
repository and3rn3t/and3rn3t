/**
 * Stylesheet size budgets. The plan for Phase 10 was a home page under 50 KB of CSS (from 113 KB);
 * it landed at about 66 KB raw (13.5 KB gzipped), so the budget sits just above where it is. It
 * can only go down: when a change makes room, lower the number.
 */
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const KB = 1024;
const size = files => {
    const text = files.map(file => readFileSync(file, 'utf8')).join('');
    return { raw: Buffer.byteLength(text), gzip: gzipSync(text, { level: 9 }).length };
};

describe('stylesheet budgets', () => {
    it('the home page: core.css + home.css stay under 72 KB raw and 16 KB gzipped', () => {
        const { raw, gzip } = size(['styles/core.css', 'styles/home.css']);
        expect(raw, `${(raw / KB).toFixed(1)} KB raw`).toBeLessThanOrEqual(72 * KB);
        expect(gzip, `${(gzip / KB).toFixed(1)} KB gzipped`).toBeLessThanOrEqual(16 * KB);
    });

    it('a project, post or 404 page: core.css + article.css stay under 42 KB raw', () => {
        const { raw } = size(['styles/core.css', 'styles/article.css']);
        expect(raw, `${(raw / KB).toFixed(1)} KB raw`).toBeLessThanOrEqual(42 * KB);
    });

    it('the status page: core.css + article.css + status.css stay under 48 KB raw and 11 KB gzipped', () => {
        const { raw, gzip } = size(['styles/core.css', 'styles/article.css', 'styles/status.css']);
        expect(raw, `${(raw / KB).toFixed(1)} KB raw`).toBeLessThanOrEqual(48 * KB);
        expect(gzip, `${(gzip / KB).toFixed(1)} KB gzipped`).toBeLessThanOrEqual(11 * KB);
    });

    it('there is one stylesheet per page type: no legacy file is back', () => {
        expect(() => readFileSync('styles.css')).toThrow();
    });
});
