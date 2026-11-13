#!/usr/bin/env node
/**
 * Fail when the uptime probe has gone quiet, or when its last check failed.
 *
 * The Worker checks the home page every five minutes (worker/probe.js) and /api/stats reports the
 * latest result. Cloudflare Monitors cannot notice the probe stopping, because a query that
 * returns no rows gives them nothing to evaluate: silence reads as "no signal", not as an
 * outage. This is the check that notices it. Unlike check-agent-ready.mjs it is a gate: a
 * failing run is the alert (GitHub emails the owner of a scheduled workflow that fails).
 *
 * Usage: pnpm check:probe [url]
 */

import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://andernet.dev';
/**
 * Three probe intervals, and /api/stats keeps its answer for five minutes: a healthy run is
 * never more than about ten minutes behind.
 */
export const MAX_AGE_MINUTES = 15;
const DEADLINE_MS = 30_000;
const RETRY_AFTER_MS = 5000;

/** "2026-11-13 00:30:54" (UTC, no zone) or an ISO string, as a Date; null if it is neither. */
export function parseUtc(text) {
  if (typeof text !== 'string' || !text) return null;
  const iso = /Z|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * What is wrong with the probe, judging from the Worker's /api/stats.
 * @param {object | null | undefined} stats
 * @param {Date} [now]
 * @returns {{ problems: string[], summary: string }}
 */
export function evaluateProbe(stats, now = new Date()) {
  const problems = [];
  const uptime = stats?.uptime;
  const last = uptime?.lastProbe;
  let summary = 'no probe result';

  if (!uptime) {
    problems.push('/api/stats has no uptime section: the Worker could not read the probe history');
  } else if (!last) {
    problems.push(
      'no check has been recorded in the last 90 days: the probe has never run, or has been silent throughout'
    );
  } else {
    const at = parseUtc(last.at);
    if (!at) {
      problems.push(`the last check has a time that cannot be read (${JSON.stringify(last.at)})`);
    } else {
      const minutes = Math.round((now.getTime() - at.getTime()) / 60_000);
      summary = `last check ${minutes} minute${minutes === 1 ? '' : 's'} ago, ${last.ok === true ? 'passed' : last.ok === false ? 'FAILED' : 'result unknown'}`;
      if (minutes > MAX_AGE_MINUTES) {
        problems.push(
          `the last check was ${minutes} minutes ago (more than ${MAX_AGE_MINUTES}): the probe has stopped`
        );
      }
    }
    if (last.ok === false) problems.push('the last check failed: the site did not answer it');
    else if (last.ok !== true)
      problems.push('the Worker did not say whether the last check passed');
  }
  return { problems, summary };
}

/** @returns {Promise<object>} the parsed /api/stats, trying twice when the first try fails */
export async function fetchStats(
  url,
  fetchImpl = fetch,
  wait = ms => new Promise(r => setTimeout(r, ms))
) {
  let failure;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetchImpl(`${url}/api/stats`, {
        signal: AbortSignal.timeout(DEADLINE_MS),
      });
      if (!response.ok) throw new Error(`/api/stats answered HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      failure = err;
      if (attempt === 0) await wait(RETRY_AFTER_MS);
    }
  }
  throw failure;
}

/**
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, now?: Date, wait?: (ms: number) => Promise<void> }} [deps]
 * @returns {Promise<{ problems: string[], summary: string }>}
 */
export async function check(url, { fetchImpl = fetch, now = new Date(), wait } = {}) {
  let stats;
  try {
    stats = await fetchStats(url, fetchImpl, wait);
  } catch (err) {
    // An API that does not answer is itself the finding
    return { problems: [`could not read ${url}/api/stats: ${err.message}`], summary: 'no answer' };
  }
  return evaluateProbe(stats, now);
}

async function main() {
  const url = (process.argv[2] ?? DEFAULT_URL).replace(/\/$/, '');
  const { problems, summary } = await check(url);
  console.log(`${url}: ${summary}`);
  for (const problem of problems) console.log(`::error::${problem}`);
  process.exitCode = problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
