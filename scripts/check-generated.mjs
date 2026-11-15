/**
 * Fails when the checked-in generated files differ from what `generate-site.mjs` writes, or the
 * committed WASM binary differs from what `assembly/hero-sim.ts` builds to.
 *
 * Run by Quality (pull requests) and by pages.yml before a deploy; also runnable locally with
 * `pnpm check:generated`. GENERATED_PATHS is the single list: update-github-data.yml stages the
 * same paths, and tests/unit/generated-files.test.js keeps the two in step.
 *
 * Uses `git status`, not `git diff`, so a brand-new generated file (untracked) counts as drift.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const GENERATED_PATHS = [
  'posts',
  'projects',
  'status',
  'feed.xml',
  'sitemap.xml',
  'llms.txt',
  'index.html',
  '404.html',
  'images',
  // Built from assembly/hero-sim.ts by `pnpm build:wasm`; the check rebuilds it
  'modules/wasm/hero-core.wasm',
];

/** @typedef {(command: string, args: string[]) => string} CommandRunner */

/** @type {CommandRunner} */
const runCommand = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe' });

/**
 * Regenerates the site, then reports whether any generated path differs from what is committed.
 * @param {CommandRunner} run injected so tests can script git's answers
 * @returns {{ ok: boolean, report: string }}
 */
export function checkGenerated(run = runCommand) {
  run('node', ['scripts/generate-site.mjs']);
  run('pnpm', ['build:wasm']);
  // trimEnd, not trim: porcelain's leading space is part of the status column (" M file").
  const drift = run('git', ['status', '--porcelain', '--', ...GENERATED_PATHS]).trimEnd();
  if (drift.trim() === '')
    return { ok: true, report: 'check-generated: generated files are up to date' };
  const stat = run('git', ['diff', '--stat', '--', ...GENERATED_PATHS]);
  return {
    ok: false,
    report: [
      `check-generated: generated files are stale:\n${drift}\n`,
      stat,
      'Run `node scripts/generate-site.mjs` and `pnpm build:wasm`, and commit the result.',
    ].join('\n'),
  };
}

function main() {
  const { ok, report } = checkGenerated();
  (ok ? console.log : console.error)(report);
  process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
