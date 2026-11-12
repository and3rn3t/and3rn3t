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
 * Edit and Transform Rules Edit. Not `.dev.vars`: wrangler loads that file into the local Worker's
 * environment.
 *
 * SSL mode is zone-wide: it applies to every proxied hostname on andernet.dev, not only this
 * site. After changing it, check the other hostnames still answer.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RULE_PREFIX, headerRules, inlineHashes } from './zone-headers.mjs';
import { cacheRules } from './zone-cache.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.cloudflare.com/client/v4';
export const ZONE_NAME = 'andernet.dev';

/**
 * What the zone should be. `kind` says which API holds the values:
 *   settings        one PATCH /zones/:id/settings/<name> per value
 *   bot_management  one PUT /zones/:id/bot_management with only the changed fields
 *   ruleset         rules in a phase (scripts/zone-headers.mjs, zone-cache.mjs); only rules whose ref starts
 *                   with "andernet-" are ours, any other rule in the phase is kept as it is
 *   security_txt    the managed /.well-known/security.txt
 *
 * `values` is an object, or a function of what the zone has now (the CSP hashes come from the
 * files on disk, and security.txt's expiry is kept until it is near).
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
  headers: {
    kind: 'ruleset',
    phase: 'http_response_headers_transform',
    why: 'Send a Link header to agents, the security headers, and a report-only CSP (apex host only).',
    values: () => headerRules(inlineHashes(ROOT)),
  },
  cache: {
    kind: 'ruleset',
    phase: 'http_request_cache_settings',
    why: 'Cache the site at the edge for an hour (apex host only); pages.yml purges it on every deploy.',
    values: () => cacheRules(),
  },
  'security-txt': {
    kind: 'security_txt',
    why: "Publish /.well-known/security.txt (Cloudflare serves it, GitHub Pages can't be told to).",
    values: current => ({
      // Part of the desired state, not only of the PUT body: otherwise the field the API adds
      // reads as an unintended change, and a file that is switched off is not seen as different
      enabled: true,
      contact: ['mailto:and3rn3t@icloud.com'],
      canonical: ['https://andernet.dev/.well-known/security.txt'],
      policy: ['https://github.com/and3rn3t/and3rn3t/security/policy'],
      preferred_languages: 'en',
      expires: securityTxtExpiry(current.expires),
    }),
  },
};

const DAY = 86_400_000;

/**
 * security.txt must carry an expiry less than a year away. Keep the one in place until it is
 * under 90 days off, so a run does not change the file for no reason; then give it a year.
 * @param {string | undefined} current - the expiry now in the file
 * @param {number} [now]
 * @returns {string} an ISO date-time
 */
export function securityTxtExpiry(current, now = Date.now()) {
  const left = Date.parse(current ?? '') - now;
  if (Number.isFinite(left) && left > 90 * DAY) return current;
  return new Date(now + 365 * DAY).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** The desired values of a group, given what the zone has now. */
export const desiredValues = (group, current) =>
  typeof group.values === 'function' ? group.values(current) : group.values;

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
 * @param {{ prune?: boolean }} [options] - prune: also report entries in `current` that are not in `desired`
 * @returns {{ name: string, from: unknown, to: unknown }[]}
 */
export function diffValues(current, desired, { prune = false } = {}) {
  const changes = Object.entries(desired)
    .filter(([name, to]) => !same(current[name], to))
    .map(([name, to]) => ({ name, from: current[name], to }));
  if (!prune) return changes;
  // Entries we own that are no longer wanted
  const removed = Object.keys(current).filter(name => !(name in desired));
  return [...changes, ...removed.map(name => ({ name, from: current[name], to: undefined }))];
}

/** A field nobody set: absent, null, an empty string or an empty list. */
const isUnset = value =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);

/**
 * Whether two values are the same. An API reports an optional field it was never given as null
 * (security.txt does, for acknowledgments, encryption and hiring), and that is not a change from
 * the field being absent.
 */
export const same = (a, b) => (isUnset(a) && isUnset(b)) || stable(a) === stable(b);

/** JSON with object keys in sorted order, so two equal objects compare equal whatever order an API used. */
export function stable(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
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
    name => !intended.includes(name) && !same(before[name], after[name])
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

async function api(token, method, path, body, { missingIsNull = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (missingIsNull && response.status === 404) return null;
  if (!response.ok || !data.success) {
    const detail = (data.errors ?? []).map(error => error.message).join('; ');
    throw new Error(`${method} ${path}: HTTP ${response.status}${detail ? ` (${detail})` : ''}`);
  }
  return data.result;
}

/** How each kind of group is read and written. */
export const KINDS = {
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
  ruleset: {
    prune: true,
    async read(token, zoneId, _names, group) {
      const { rules } = await readEntrypoint(token, zoneId, group.phase);
      return Object.fromEntries(rules.filter(isOurs).map(item => [item.ref, ruleShape(item)]));
    },
    async write(token, zoneId, _changes, group, desired) {
      const { rules } = await readEntrypoint(token, zoneId, group.phase);
      const sent = mergeRules(rules, desired);
      await api(token, 'PUT', `/zones/${zoneId}/rulesets/phases/${group.phase}/entrypoint`, {
        rules: sent,
      });
      // Header rules run in order and a later one overwrites an earlier one, so the whole
      // sequence is checked, not only that the rules that are not ours survived
      const after = await readEntrypoint(token, zoneId, group.phase);
      const expected = ruleSequence(sent);
      const actual = ruleSequence(after.rules);
      if (stable(actual) !== stable(expected)) {
        throw new Error(
          `${group.phase}: the rules are not in the order that was sent. Sent: ${expected}; found: ${actual}`
        );
      }
    },
  },
  security_txt: {
    async read(token, zoneId) {
      // Nothing set yet reads as an empty string
      const current = await api(
        token,
        'GET',
        `/zones/${zoneId}/security-center/securitytxt`,
        undefined,
        { missingIsNull: true }
      );
      return current && typeof current === 'object' ? current : {};
    },
    async write(token, zoneId, _changes, _group, desired) {
      await api(token, 'PUT', `/zones/${zoneId}/security-center/securitytxt`, desired);
    },
  },
};

/**
 * The rules to send: the ones in the phase now, with each of ours replaced where it stands, any
 * of ours that is no longer wanted dropped, and new ones added at the end. A PUT replaces the
 * whole phase, so rules that are not ours go back exactly as they were, in the same places: a
 * dashboard exception that sits after one of our rules must stay after it.
 * @param {object[]} current - the rules in the phase now
 * @param {Record<string, object>} desired - our rules by ref
 * @returns {object[]}
 */
export function mergeRules(current, desired) {
  const merged = [];
  const placed = new Set();
  for (const item of current) {
    if (!isOurs(item)) merged.push(item);
    else if (item.ref in desired) {
      merged.push({ ref: item.ref, ...desired[item.ref] });
      placed.add(item.ref);
    }
  }
  for (const [ref, item] of Object.entries(desired)) {
    if (!placed.has(ref)) merged.push({ ref, ...item });
  }
  return merged;
}

/** Each rule by name: its ref when it is ours, else its id (the rules that are not ours have an id). */
const ruleSequence = rules => rules.map(item => (isOurs(item) ? item.ref : item.id));

const isOurs = item => typeof item.ref === 'string' && item.ref.startsWith(RULE_PREFIX);

/** A rule as the script defines it, without the fields the API adds (id, version, last_updated, ...). */
const ruleShape = item => ({
  description: item.description,
  expression: item.expression,
  action: item.action,
  enabled: item.enabled ?? true,
  action_parameters: item.action_parameters,
});

/** The rules in a phase; a phase nobody has put a rule in has no ruleset yet. */
async function readEntrypoint(token, zoneId, phase) {
  const ruleset = await api(
    token,
    'GET',
    `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`,
    undefined,
    { missingIsNull: true }
  );
  return { rules: ruleset?.rules ?? [] };
}

/** A rule on one line: when it applies, and what it sets (the CSP itself is too long to print). */
export function describeRule(item) {
  const parameters = item.action_parameters ?? {};
  if (item.action === 'set_cache_settings') {
    const { mode, default: seconds } = parameters.edge_ttl ?? {};
    return `when ${item.expression} -> cache${mode ? `, edge TTL ${seconds}s (${mode})` : ''}`;
  }
  const headers = Object.entries(parameters.headers ?? {})
    .map(([name, { operation }]) => `${operation} ${name}`)
    .join(', ');
  return `when ${item.expression} -> ${headers}`;
}

const show = value => {
  const text = value === undefined ? '(none)' : stable(value);
  return text.length > 150 ? `${text.slice(0, 147)}...` : text;
};

async function main() {
  const { apply, only } = parseArgs(process.argv.slice(2));
  const token = readToken();
  const [zone] = await api(token, 'GET', `/zones?name=${ZONE_NAME}`);
  if (!zone) throw new Error(`The token cannot see the zone ${ZONE_NAME}`);
  console.log(`${zone.name} (${zone.plan.name})${apply ? '' : ', dry run'}`);

  let pending = 0;
  for (const name of only) {
    const group = GROUPS[name];
    const { read, write, prune = false } = KINDS[group.kind];
    const describe = value =>
      group.kind === 'ruleset' && value ? describeRule(value) : show(value);
    const { why } = group;
    // Groups whose values depend on the zone's state read it whole; the others read what they set
    const names = typeof group.values === 'function' ? [] : Object.keys(group.values);
    const before = await read(token, zone.id, names, group);
    const values = desiredValues(group, before);
    const changes = diffValues(before, values, { prune });
    console.log(`\n${name}: ${why}`);
    if (!changes.length) {
      console.log('  as it should be');
      continue;
    }
    for (const { name: field, from, to } of changes) {
      console.log(`  ${field}: ${describe(from)} -> ${describe(to)}`);
    }
    if (!apply) {
      pending += changes.length;
      continue;
    }

    await write(token, zone.id, changes, group, values);
    const after = await read(token, zone.id, names, group);
    const left = diffValues(after, desiredValues(group, after), { prune });
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
