/**
 * Fails when the checked-in generated files differ from what `generate-site.mjs` writes.
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
];

const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe' });

function main() {
  run('node', ['scripts/generate-site.mjs']);
  const drift = run('git', ['status', '--porcelain', '--', ...GENERATED_PATHS]).trim();
  if (drift === '') {
    console.log('check-generated: generated files are up to date');
    return;
  }
  console.error(`check-generated: generated files are stale:\n${drift}\n`);
  console.error(run('git', ['diff', '--stat', '--', ...GENERATED_PATHS]));
  console.error('Run `node scripts/generate-site.mjs` and commit the result.');
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
