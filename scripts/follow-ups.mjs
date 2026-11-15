#!/usr/bin/env node
/**
 * Open a GitHub issue for each dated follow-up once it is due, with the live numbers attached.
 *
 * Some decisions wait on data that only exists later (two weeks of CSP reports, a month of crawler
 * traffic). This turns "remember to check on 2026-11-27" into an issue that appears on its own.
 * An issue is opened once: a closed one counts, so closing it means "done".
 *
 * Usage:
 *   node scripts/follow-ups.mjs [url]             dry run: print what is due, create nothing
 *   node scripts/follow-ups.mjs [url] --create    open the missing issues (needs GH_TOKEN and gh)
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://andernet.dev';

const unavailable = 'Live stats were not available when this issue was opened; read `/api/stats`.';

/** @param {{ csp?: { last7d?: number, since?: string, byDirective?: Array<{ directive: string, count: number }> } } | null} stats */
export function cspBody(stats) {
  const csp = stats?.csp;
  if (!csp) return `${unavailable}\n\n${CSP_ADVICE}`;
  const byDirective = (csp.byDirective ?? [])
    .map(({ directive, count }) => `- \`${directive}\`: ${count}`)
    .join('\n');
  return [
    `Report-only CSP reports in the last 7 days: **${csp.last7d ?? 'unknown'}** (counting since ${csp.since ?? 'unknown'}).`,
    byDirective && `By directive:\n${byDirective}`,
    CSP_ADVICE,
  ]
    .filter(Boolean)
    .join('\n\n');
}

const CSP_ADVICE =
  'A steady zero is the evidence for enforcing; enforcing is a separate decision made by changing the `headers` group in `scripts/zone-headers.mjs` and applying it (`zone-apply` skill). One-off reports from browser extensions are common: check the blocked URI before counting one against the policy.';

/** @param {{ crawlers?: Array<{ category: string, requests: number }> } | null} stats */
export function crawlBody(stats) {
  const crawlers = stats?.crawlers;
  if (!crawlers?.length) return `${unavailable}\n\n${CRAWL_ADVICE}`;
  const rows = crawlers.map(({ category, requests }) => `- ${category}: ${requests}`).join('\n');
  return `Verified crawler requests from \`/api/stats\` today:\n${rows}\n\n${CRAWL_ADVICE}`;
}

const CRAWL_ADVICE =
  'Compare with the AI Crawl Control baseline taken on 2026-11-11 (crawler mix, bot 404s, referrals) in the Cloudflare dashboard. The point of allowing AI training crawlers was to be in the answers: look for AI referrals, not only crawler volume.';

export const FOLLOW_UPS = [
  {
    due: '2026-11-27',
    title: 'Decide: enforce the CSP or keep it report-only',
    body: cspBody,
  },
  {
    due: '2026-12-09',
    title: 'Compare AI crawler traffic with the 2026-11-11 baseline',
    body: crawlBody,
  },
];

/**
 * @param {string} today - YYYY-MM-DD
 * @param {typeof FOLLOW_UPS} followUps
 */
export const dueFollowUps = (today, followUps = FOLLOW_UPS) =>
  followUps.filter(({ due }) => due <= today);

/** @typedef {(command: string, args: string[]) => string} CommandRunner */

/** @type {CommandRunner} */
const runCommand = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe' });

/**
 * @param {{ today: string, stats: object | null, create: boolean, run?: CommandRunner }} options
 * @returns {{ opened: string[], existing: string[], notDue: string[] }}
 */
export function openDueIssues({ today, stats, create, run = runCommand }) {
  const due = dueFollowUps(today);
  const notDue = FOLLOW_UPS.filter(item => !due.includes(item)).map(item => item.title);
  const opened = [];
  const existing = [];
  for (const { title, body } of due) {
    const found = JSON.parse(
      run('gh', [
        'issue',
        'list',
        '--state',
        'all',
        '--search',
        `"${title}" in:title`,
        '--json',
        'title',
      ])
    ).some(issue => issue.title === title);
    if (found) {
      existing.push(title);
      continue;
    }
    if (create) run('gh', ['issue', 'create', '--title', title, '--body', body(stats)]);
    opened.push(title);
  }
  return { opened, existing, notDue };
}

async function fetchStats(url) {
  try {
    const response = await fetch(`${url}/api/stats`, { signal: AbortSignal.timeout(20_000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const create = args.includes('--create');
  const url = args.find(arg => !arg.startsWith('--')) ?? DEFAULT_URL;
  const today = new Date().toISOString().slice(0, 10);
  const { opened, existing, notDue } = openDueIssues({
    today,
    stats: await fetchStats(url),
    create,
  });
  const verb = create ? 'opened' : 'would open';
  console.log(`${verb}: ${opened.join('; ') || 'none'}`);
  console.log(`already open or closed: ${existing.join('; ') || 'none'}`);
  console.log(`not due yet: ${notDue.join('; ') || 'none'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
