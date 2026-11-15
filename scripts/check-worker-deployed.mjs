#!/usr/bin/env node
/**
 * Report when the live Worker is older than the last commit that changed it.
 *
 * Worker deploys wait for an explicit go (the ship-worker skill), so a merge to main can sit
 * undeployed with nothing to show for it. `pnpm deploy:worker` tags each Worker version with the
 * short SHA it was deployed from, /api/edge reports that tag, and this compares it with the
 * history: the deploy is current when its commit contains the newest commit that touched
 * worker/ or wrangler.toml. Report only (a `::warning::`), because "merged, not yet deployed" is
 * a normal state between a merge and a go.
 *
 * Needs the full git history (a shallow clone cannot place the tag).
 * Usage: pnpm check:worker-deployed [url]
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://andernet.dev';
const WORKER_PATHS = ['worker', 'wrangler.toml'];
const DEADLINE_MS = 30_000;

/**
 * @typedef {{
 *   lastWorkerCommit: () => string | null,
 *   resolve: (ref: string) => string | null,
 *   isAncestor: (ancestor: string, descendant: string) => boolean,
 * }} Git
 */

/** @returns {Git} the checkout in the current directory */
export function localGit() {
  const git = args =>
    execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  return {
    lastWorkerCommit: () => git(['log', '-1', '--format=%H', '--', ...WORKER_PATHS]) || null,
    resolve: ref => {
      try {
        return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) || null;
      } catch {
        return null;
      }
    },
    isAncestor: (ancestor, descendant) => {
      try {
        git(['merge-base', '--is-ancestor', ancestor, descendant]);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * @param {string | null | undefined} version the `version` field of /api/edge
 * @param {Git} git
 * @returns {{ status: 'current' | 'behind' | 'unknown', message: string }}
 */
export function evaluateDeploy(version, git) {
  const newest = git.lastWorkerCommit();
  if (!newest) return { status: 'unknown', message: 'no commit touches worker/ or wrangler.toml' };
  if (!version) return { status: 'unknown', message: '/api/edge reports no Worker version' };
  const deployedFrom = git.resolve(version);
  // An untagged version id (a deploy that did not go through pnpm deploy:worker) is not a commit
  if (!deployedFrom) {
    return {
      status: 'unknown',
      message: `live version ${version} is not a commit in this history (an untagged deploy, or a shallow clone)`,
    };
  }
  const short = newest.slice(0, 7);
  return git.isAncestor(newest, deployedFrom)
    ? {
        status: 'current',
        message: `live Worker ${version} includes the last Worker change (${short})`,
      }
    : {
        status: 'behind',
        message: `live Worker ${version} predates the last Worker change (${short}): merged, not deployed`,
      };
}

/** @returns {Promise<string | null>} the Worker version /api/edge reports */
export async function fetchVersion(url, fetchImpl = fetch) {
  const response = await fetchImpl(`${url}/api/edge`, { signal: AbortSignal.timeout(DEADLINE_MS) });
  if (!response.ok) throw new Error(`/api/edge answered HTTP ${response.status}`);
  const body = await response.json();
  return typeof body?.version === 'string' ? body.version : null;
}

async function main() {
  const url = (process.argv[2] ?? DEFAULT_URL).replace(/\/$/, '');
  let version;
  try {
    version = await fetchVersion(url);
  } catch (err) {
    console.log(`::warning::could not read ${url}/api/edge: ${err.message}`);
    return;
  }
  const { status, message } = evaluateDeploy(version, localGit());
  console.log(status === 'current' ? message : `::warning::${message}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
