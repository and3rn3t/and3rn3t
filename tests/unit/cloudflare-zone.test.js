/**
 * scripts/cloudflare-zone.mjs: the parts that decide what gets written to the live zone.
 * The API calls themselves are not tested here; the script reads back what it wrote.
 */
import { describe, expect, it } from 'vitest';
import {
    GROUPS,
    diffValues,
    parseArgs,
    parseEnv,
    unintendedChanges,
} from '../../scripts/cloudflare-zone.mjs';

describe('parseEnv', () => {
    it('reads key=value lines, skipping comments and blanks', () => {
        expect(parseEnv('# the token\n\ntoken=abc123\nother = x y \n')).toEqual({
            token: 'abc123',
            other: 'x y',
        });
    });

    it('drops matching quotes, and keeps an = inside the value', () => {
        expect(parseEnv('token="a=b"\nsingle=\'c\'')).toEqual({ token: 'a=b', single: 'c' });
    });
});

describe('parseArgs', () => {
    it('is a dry run over every group by default', () => {
        expect(parseArgs([])).toEqual({ apply: false, only: Object.keys(GROUPS) });
    });

    it('takes --apply and a list of groups', () => {
        expect(parseArgs(['--apply', '--only', 'tls'])).toEqual({ apply: true, only: ['tls'] });
    });

    it('takes --only=tls as well as --only tls, and a comma-separated list', () => {
        expect(parseArgs(['--only=tls'])).toEqual({ apply: false, only: ['tls'] });
        expect(parseArgs(['--apply', '--only=tls,ai-crawlers'])).toEqual({
            apply: true,
            only: ['tls', 'ai-crawlers'],
        });
    });

    // Falling back to "every group" on a typo would write live settings under --apply
    it.each([[['--ony', 'tls']], [['--apply', '--ony=tls']], [['tls']], [['--apply', '--aply']]])(
        'rejects the unrecognised argument in %j',
        argv => {
            expect(() => parseArgs(argv)).toThrow(/Unknown argument/);
        }
    );

    // A typo must not quietly become "every group"
    it.each([[['--only', 'tsl']], [['--only=tsl']], [['--only']], [['--only=']], [['--only', '']]])(
        'rejects %j',
        argv => {
            expect(() => parseArgs(argv)).toThrow(/--only takes group names/);
        }
    );
});

describe('diffValues', () => {
    it('lists only the values that differ', () => {
        expect(diffValues({ ssl: 'flexible', min_tls_version: '1.2' }, GROUPS.tls.values)).toEqual([
            { name: 'ssl', from: 'flexible', to: 'full' },
        ]);
    });

    it('compares objects by content', () => {
        expect(diffValues({ a: { b: 1 } }, { a: { b: 1 } })).toEqual([]);
        expect(diffValues({}, { a: { b: 1 } })).toEqual([
            { name: 'a', from: undefined, to: { b: 1 } },
        ]);
    });
});

describe('unintendedChanges', () => {
    it('names a field that changed without being asked to', () => {
        const before = { ai_training: 'disallow', crawler_protection: 'enabled', enable_js: false };
        const after = { ai_training: 'disabled', crawler_protection: 'disabled', enable_js: false };
        expect(unintendedChanges(before, after, ['ai_training'])).toEqual(['crawler_protection']);
    });

    it('notices a field that appeared or went away', () => {
        expect(unintendedChanges({ a: 1 }, { b: 2 }, [])).toEqual(['a', 'b']);
    });
});

describe('the desired zone', () => {
    // GitHub Pages has no certificate for andernet.dev: "strict" would take the site down (526),
    // and "flexible" sends the origin leg in the clear
    it('encrypts to the origin without checking the certificate name', () => {
        expect(GROUPS.tls.values.ssl).toBe('full');
    });

    it('agrees with robots.txt: AI crawlers are let in', () => {
        expect(GROUPS['ai-crawlers'].values).toEqual({
            ai_bots_protection: 'disabled',
            ai_training: 'disabled',
        });
    });

    it('every group says why, and uses a kind the script knows', () => {
        for (const group of Object.values(GROUPS)) {
            expect(group.why).toMatch(/\w/);
            expect(['settings', 'bot_management']).toContain(group.kind);
        }
    });
});
