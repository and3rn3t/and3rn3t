#!/usr/bin/env node
/**
 * Report how agent-ready the live site is, using the public scanner at isitagentready.com.
 *
 * Report only: this always exits 0. The scanner's check list grows on its own (it already has
 * checks that Cloudflare's launch post never mentioned), and five of today's checks do not apply
 * to a portfolio with nothing to sign in to, so gating a build on it would fail for reasons that
 * are not ours.
 *
 * Usage: pnpm check:agent-ready [url]
 */

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SCANNER = 'https://isitagentready.com/mcp';
const DEFAULT_URL = 'https://andernet.dev';

/** Checks that do not apply here: nothing on the site needs OAuth, an agent card or DNS-AID. */
export const NOT_APPLICABLE = [
  'oauthDiscovery',
  'oauthProtectedResource',
  'authMd',
  'a2aAgentCard',
  'dnsAid',
];

/**
 * @param {string} report - the scanner's Markdown answer
 * @returns {{ level: string | null, passing: string[], failing: string[] }}
 */
export function parseReport(report) {
  const level = report.match(/\*\*Level (\d+\/\d+)/)?.[1] ?? null;
  const passing = [...report.matchAll(/^- PASS (\w+)/gm)].map(match => match[1]);
  const failing = [...report.matchAll(/^- FAIL (\w+)/gm)].map(match => match[1]);
  return { level, passing, failing };
}

/** Failing checks that are not on the not-applicable list: the ones worth a look. */
export const surprises = ({ failing }) => failing.filter(name => !NOT_APPLICABLE.includes(name));

/**
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<string>} the scanner's Markdown report
 */
export async function scan(url, fetchImpl = fetch) {
  const response = await fetchImpl(SCANNER, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'scan_site', arguments: { url } },
    }),
  });
  if (!response.ok) throw new Error(`scanner answered HTTP ${response.status}`);
  const lastData = (await response.text())
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .pop();
  if (!lastData) throw new Error('scanner sent no result');
  const text = JSON.parse(lastData.slice('data:'.length)).result?.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('scanner result had no text');
  return text;
}

/** The summary, as Markdown (also written to the job summary on GitHub Actions). */
export function summarise(url, result) {
  const unexpected = surprises(result);
  return [
    `### Agent readiness: ${url}`,
    '',
    `Level **${result.level ?? 'unknown'}**, ${result.passing.length} checks passing.`,
    '',
    unexpected.length
      ? `Failing, and worth a look: ${unexpected.map(name => `\`${name}\``).join(', ')}`
      : 'Nothing failing apart from the checks that do not apply here.',
    `Not applicable on purpose: ${NOT_APPLICABLE.map(name => `\`${name}\``).join(', ')}`,
  ].join('\n');
}

async function main() {
  const url = process.argv[2] ?? DEFAULT_URL;
  try {
    const summary = summarise(url, parseReport(await scan(url)));
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  } catch (error) {
    // A scanner outage is not a problem with the site
    console.log(`Could not scan ${url}: ${error.message}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
