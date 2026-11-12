#!/usr/bin/env node
/**
 * The Cloudflare zone settings this site depends on, written down and applied from here.
 *
 * The zone (andernet.dev) sits in front of GitHub Pages. These settings used to exist only in
 * the dashboard, where nobody reviews them and some are hard to find. GROUPS below is what the
 * zone should be; this script shows how the live zone differs and, when asked, fixes it.
 *
 * Usage:
 *   pnpm zone                       dry run: print what differs, change nothing
 *   pnpm zone --apply               write the differences, then read them back
 *   pnpm zone --only tls            limit either to some groups (comma-separated)
 *
 * The API token comes from CLOUDFLARE_API_TOKEN or from a gitignored `.cloudflare.env`
 * (`token=<value>`). It needs, for this zone: Zone Read, Zone Settings Edit, Bot Management
 * Edit. Not `.dev.vars`: wrangler loads that file into the local Worker's environment.
 *
 * SSL mode is zone-wide: it applies to every proxied hostname on andernet.dev, not only this
 * site. After changing it, check the other hostnames still answer.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';
export const ZONE_NAME = 'andernet.dev';

/**
 * What the zone should be. `kind` says which API holds the values:
 *   settings        one PATCH /zones/:id/settings/<name> per value
 *   bot_management  one PUT /zones/:id/bot_management with only the changed fields
 */
export const GROUPS = {
  tls: {
    kind: 'settings',
    why: 'Encrypt the hop from Cloudflare to the origin, and refuse TLS 1.0 and 1.1.',
    values: {
      // "full", not "strict": GitHub Pages answers for andernet.dev with its *.github.io
      // certificate (it cannot issue one for a proxied domain), which strict would reject with
      // a 526. "flexible" sent the origin leg over plain HTTP.
      ssl: 'full',
      min_tls_version: '1.2',
    },
  },
  'ai-crawlers': {
    kind: 'bot_management',
    why: 'Let AI crawlers in: the site wants to be found, cited and learned from (see robots.txt).',
    values: {
      // The WAF rule that blocks AI crawlers at the edge, whatever robots.txt says
      ai_bots_protection: 'disabled',
      // "disabled" is the dashboard's "Allow". "disallow" made Cloudflare prepend a block of
      // Disallow rules and ai-train=no to the served robots.txt, and block at the edge too.
      ai_training: 'disabled',
    },
  },
};

/**
 * `key=value` lines, as in .cloudflare.env. Quotes around a value are dropped.
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
  const entries = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const at = line.indexOf('=');
      const value = line.slice(at + 1).trim();
      return [line.slice(0, at).trim(), value.replace(/^(['"])(.*)\1$/, '$2')];
    });
  return Object.fromEntries(entries);
}

/**
 * @param {string[]} argv - the arguments after the script name
 * @returns {{ apply: boolean, only: string[] }}
 */
export function parseArgs(argv) {
  const groups = Object.keys(GROUPS);
  let apply = false;
  let only = null;
  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--only' || arg.startsWith('--only=')) {
      // Both "--only tls" and "--only=tls"
      const value = arg === '--only' ? (argv[++at] ?? '') : arg.slice('--only='.length);
      only = value.split(',').filter(Boolean);
      const unknown = only.filter(name => !GROUPS[name]);
      if (unknown.length || !only.length) {
        throw new Error(`--only takes group names (${groups.join(', ')}); got "${value}"`);
      }
    } else {
      // A typo must not fall back to "every group": with --apply that writes live settings
      throw new Error(`Unknown argument "${arg}". Use --apply and --only <${groups.join('|')}>`);
    }
  }
  return { apply, only: only ?? groups };
}

/**
 * The values that are not yet what they should be.
 * @param {Record<string, unknown>} current
 * @param {Record<string, unknown>} desired
 * @returns {{ name: string, from: unknown, to: unknown }[]}
 */
export function diffValues(current, desired) {
  return Object.entries(desired)
    .filter(([name, to]) => JSON.stringify(current[name]) !== JSON.stringify(to))
    .map(([name, to]) => ({ name, from: current[name], to }));
}

/**
 * The fields that changed although nobody asked: a partial update must leave the rest alone.
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @param {string[]} intended - the fields that were meant to change
 * @returns {string[]}
 */
export function unintendedChanges(before, after, intended) {
  return Object.keys({ ...before, ...after }).filter(
    name => !intended.includes(name) && JSON.stringify(before[name]) !== JSON.stringify(after[name])
  );
}

function readToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const file = join(ROOT, '.cloudflare.env');
  const token = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')).token : null;
  if (!token) {
    throw new Error(
      'No API token: set CLOUDFLARE_API_TOKEN or put token=<value> in .cloudflare.env'
    );
  }
  return token;
}

async function api(token, method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    const detail = (data.errors ?? []).map(error => error.message).join('; ');
    throw new Error(`${method} ${path}: HTTP ${response.status}${detail ? ` (${detail})` : ''}`);
  }
  return data.result;
}

/** How each kind of group is read and written. */
const KINDS = {
  settings: {
    async read(token, zoneId, names) {
      const values = await Promise.all(
        names.map(name => api(token, 'GET', `/zones/${zoneId}/settings/${name}`))
      );
      return Object.fromEntries(names.map((name, index) => [name, values[index].value]));
    },
    async write(token, zoneId, changes) {
      for (const { name, to } of changes) {
        await api(token, 'PATCH', `/zones/${zoneId}/settings/${name}`, { value: to });
      }
    },
  },
  bot_management: {
    read: (token, zoneId) => api(token, 'GET', `/zones/${zoneId}/bot_management`),
    async write(token, zoneId, changes) {
      const body = Object.fromEntries(changes.map(({ name, to }) => [name, to]));
      await api(token, 'PUT', `/zones/${zoneId}/bot_management`, body);
    },
  },
};

async function main() {
  const { apply, only } = parseArgs(process.argv.slice(2));
  const token = readToken();
  const [zone] = await api(token, 'GET', `/zones?name=${ZONE_NAME}`);
  if (!zone) throw new Error(`The token cannot see the zone ${ZONE_NAME}`);
  console.log(`${zone.name} (${zone.plan.name})${apply ? '' : ', dry run'}`);

  let pending = 0;
  for (const name of only) {
    const { kind, why, values } = GROUPS[name];
    const { read, write } = KINDS[kind];
    const before = await read(token, zone.id, Object.keys(values));
    const changes = diffValues(before, values);
    console.log(`\n${name}: ${why}`);
    if (!changes.length) {
      console.log('  as it should be');
      continue;
    }
    for (const { name: field, from, to } of changes) {
      console.log(`  ${field}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    }
    if (!apply) {
      pending += changes.length;
      continue;
    }

    await write(token, zone.id, changes);
    const after = await read(token, zone.id, Object.keys(values));
    const left = diffValues(after, values);
    if (left.length) {
      throw new Error(`${name}: still differs after writing: ${left.map(c => c.name).join(', ')}`);
    }
    const strays = unintendedChanges(
      before,
      after,
      changes.map(change => change.name)
    );
    if (strays.length) {
      throw new Error(`${name}: these changed too, and were not meant to: ${strays.join(', ')}`);
    }
    console.log('  applied, and read back');
  }

  if (pending) console.log(`\n${pending} to change. Run again with --apply to write them.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main();
  } catch (error) {
    console.error(`cloudflare-zone: ${error.message}`);
    process.exitCode = 1;
  }
}
