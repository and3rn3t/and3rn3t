/**
 * The site's own code reaches no Trusted Types sink with a plain string (AGENTS.md, "Trusted Types").
 * tests/e2e/csp-report.spec.js proves that for what a local browser runs; this reads the source, so
 * a sink that only runs on https (the service worker's register()) or only in some browsers is
 * caught too. It is a pattern check, not a parser: when it flags a line that is fine, wrap it the
 * way the neighbours are, or say why in a comment next to an allowed exception.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, out);
        else if (name.endsWith('.js') && !name.startsWith('hero-core')) out.push(path);
    }
    return out;
}

// Browser code: main.js, the modules, and the service worker (which has no DOM but does importScripts)
const FILES = [join(ROOT, 'main.js'), join(ROOT, 'sw.js'), ...walk(join(ROOT, 'modules'))];

/** Source lines with the comments and blank lines left out, as [file, line number, text]. */
function codeLines() {
    return FILES.flatMap(file =>
        readFileSync(file, 'utf8')
            .split('\n')
            .map((text, index) => [relative(ROOT, file), index + 1, text])
            .filter(([, , text]) => text.trim() && !/^\s*(\/\/|\*|\/\*)/.test(text))
    );
}

const lines = codeLines();
const flagged = (pattern, ok) =>
    lines
        .filter(([, , text]) => pattern.test(text) && !(ok && ok.test(text)))
        .map(([file, number, text]) => `${file}:${number}: ${text.trim()}`);

describe('no plain string reaches a Trusted Types sink', () => {
    it('innerHTML and outerHTML are assigned through trustedHtml()', () => {
        expect(flagged(/\.(inner|outer)HTML\s*=(?!=)/, /trustedHtml\(/)).toEqual([]);
    });

    it('a script address is set through trustedScriptUrl()', () => {
        expect(flagged(/\bscript\.src\s*=(?!=)/, /trustedScriptUrl\(/)).toEqual([]);
    });

    it('the service worker is registered with a script address from the policy', () => {
        expect(
            flagged(/serviceWorker\s*\.register\(|\.register\(\s*['"`]/, /trustedScriptUrl\(/)
        ).toEqual([]);
        // register( may be on its own line after .serviceWorker; the call that matters names the policy
        const registration = readFileSync(join(ROOT, 'modules/sw-register.js'), 'utf8');
        expect(registration).toMatch(/register\(trustedScriptUrl\(/);
    });

    it('nothing uses the sinks that have no safe form here', () => {
        expect(
            flagged(
                /insertAdjacentHTML\(|document\.write(ln)?\(|createContextualFragment\(|\.srcdoc\s*=|\beval\(|new Function\(|importScripts\(\s*['"`]|set(Timeout|Interval)\(\s*['"`]/
            )
        ).toEqual([]);
    });

    it('looks at the files it should (a rename must not make this pass by finding nothing)', () => {
        const names = FILES.map(file => relative(ROOT, file));
        for (const expected of ['main.js', 'sw.js', 'modules/ui.js', 'modules/guestbook.js']) {
            expect(names).toContain(expected);
        }
        expect(lines.length).toBeGreaterThan(2000);
    });
});
