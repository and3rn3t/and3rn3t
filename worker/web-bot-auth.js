/**
 * Web Bot Auth: does a request carry a valid HTTP message signature (RFC 9421, profile
 * draft-ietf-webbotauth-httpsig-protocol) from an agent that publishes its key?
 *
 * An agent sends `Signature-Input` (what was signed, with `tag="web-bot-auth"`, `keyid`, `created`,
 * `expires`), `Signature`, and `Signature-Agent` (the https address of its key directory, which
 * must itself be signed over). The key is an Ed25519 public key in a JSON Web Key Set at
 * `<agent>/.well-known/http-message-signatures-directory`; `keyid` is the key's JWK thumbprint.
 *
 * What this proves, and what it does not: that whoever sent the request holds the private key for
 * a key published by the host named in `Signature-Agent`. It does not say that host is a
 * company anyone trusts (Cloudflare's own "verified" is a registered directory). The Worker only
 * COUNTS this (worker/telemetry.js); nothing is allowed or blocked because of it. Cloudflare
 * documents no field a Worker on this plan can read for the result, hence this file.
 *
 * Deliberately not done: checking the signature on the directory response itself (tag
 * `http-message-signatures-directory`), nonce tracking (a short `expires` is the replay limit, as at
 * Cloudflare), and `@query-params` and the other component parameters (unsupported here as there).
 *
 * The directory is fetched from a host the sender names, so the fetch is narrow: https only, a
 * host name (no address, no port, no credentials), a fixed path, a short timeout, a small body,
 * no redirects, cached, and capped at a few uncached fetches a minute per isolate.
 *
 * Workers-compatible: Web Crypto only.
 */

export const SIGNATURE_TAG = 'web-bot-auth';
export const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';

const MAX_DIRECTORY_BYTES = 16 * 1024;
const FETCH_TIMEOUT_MS = 2000;
const CACHE_SECONDS = 3600;
const CACHE_ENTRIES = 32;
const FETCHES_PER_MINUTE = 10;
const CLOCK_SKEW_SECONDS = 60;

/** @typedef {{ status: 'valid' | 'invalid' | 'unchecked', reason?: string }} SignatureResult */

const invalid = reason => ({ status: 'invalid', reason });

// ── Parsing (RFC 8941 / 9421, only as far as this profile needs) ─────────────

/**
 * Split a header dictionary at top-level commas (outside quotes and parentheses).
 * @param {string} text
 * @returns {string[]}
 */
export function splitMembers(text) {
    const members = [];
    let depth = 0;
    let quoted = false;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && text[i - 1] !== '\\') quoted = !quoted;
        else if (!quoted && char === '(') depth++;
        else if (!quoted && char === ')') depth--;
        else if (!quoted && depth === 0 && char === ',') {
            members.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    members.push(text.slice(start).trim());
    return members.filter(Boolean);
}

/**
 * One `Signature-Input` member: `label=("a" "b");created=1;keyid="k"`.
 * @param {string} member
 * @returns {{ label: string, raw: string, components: { name: string, parameterised: boolean }[],
 *   params: Record<string, string | number | boolean> } | null}
 */
export function parseSignatureInput(member) {
    const match = /^([a-z][a-z0-9_*-]*)=(\([^)]*\))((?:;[^;]*)*)$/i.exec(member);
    if (!match) return null;
    const [, label, list, rest] = match;
    const components = [...list.slice(1, -1).matchAll(/"([^"]*)"((?:;[^\s)]*)*)/g)].map(
        ([, name, parameters]) => ({ name, parameterised: parameters !== '' })
    );
    const params = {};
    for (const part of rest.split(';').filter(Boolean)) {
        const [key, ...value] = part.split('=');
        const text = value.join('=');
        if (/^-?\d+$/.test(text)) params[key] = Number(text);
        else if (/^".*"$/.test(text)) params[key] = text.slice(1, -1);
        else params[key] = text === '' ? true : text;
    }
    return { label, raw: `${list}${rest}`, components, params };
}

/**
 * The `Signature` header: `label=:base64:` members.
 * @param {string} text
 * @returns {Map<string, Uint8Array>}
 */
export function parseSignatures(text) {
    const signatures = new Map();
    for (const [, label, base64] of text.matchAll(/([a-z][a-z0-9_*-]*)=:([A-Za-z0-9+/=]*):/gi)) {
        try {
            signatures.set(
                label,
                Uint8Array.from(atob(base64), char => char.charCodeAt(0))
            );
        } catch {
            // A member that is not base64 is simply not there
        }
    }
    return signatures;
}

/**
 * The directory address a `Signature-Agent` header names, or null when it is not a safe one:
 * a double-quoted https URL for a host name, with no port, credentials, path, query or address.
 * @param {string | null} header
 * @returns {{ host: string, url: string } | null}
 */
export function directoryFor(header) {
    const match = /^"https:\/\/([a-z0-9][a-z0-9.-]*\.[a-z0-9-]+)\/?"$/i.exec((header ?? '').trim());
    if (!match) return null;
    const host = match[1].toLowerCase();
    // A dotted number is an address, not a name
    if (/^[\d.]+$/.test(host) || host.endsWith('.local') || host.endsWith('.internal')) return null;
    return { host, url: `https://${host}${DIRECTORY_PATH}` };
}

// ── The signature base ───────────────────────────────────────────────────────

/**
 * The text that was signed (RFC 9421 section 2.5): one line per covered component, then the
 * signature parameters. Returns null for a component this profile does not support.
 * @param {Request} request
 * @param {{ components: { name: string, parameterised: boolean }[], raw: string }} input
 * @returns {string | null}
 */
export function signatureBase(request, input) {
    const url = new URL(request.url);
    const derived = {
        '@authority': url.host.toLowerCase(),
        '@method': request.method.toUpperCase(),
        '@path': url.pathname || '/',
        '@target-uri': url.href,
        '@scheme': url.protocol.slice(0, -1),
        '@query': url.search || '?',
    };
    const lines = [];
    for (const { name, parameterised } of input.components) {
        if (parameterised) return null;
        let value;
        if (name.startsWith('@')) value = derived[name];
        else if (name === name.toLowerCase()) value = request.headers.get(name)?.trim();
        if (value === undefined || value === null) return null;
        lines.push(`"${name}": ${value}`);
    }
    lines.push(`"@signature-params": ${input.raw}`);
    return lines.join('\n');
}

// ── Keys ─────────────────────────────────────────────────────────────────────

const base64url = bytes =>
    btoa(String.fromCharCode(...new Uint8Array(bytes)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');

/**
 * The JWK thumbprint (RFC 7638) of an Ed25519 key, which is what `keyid` carries.
 * @param {{ x: string }} jwk
 * @returns {Promise<string>}
 */
export async function thumbprint(jwk) {
    const canonical = `{"crv":"Ed25519","kty":"OKP","x":"${jwk.x}"}`;
    return base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
}

/**
 * Check a signature against the keys a directory publishes: the one whose thumbprint is `keyid`.
 * @param {{ keys?: object[] }} directory
 * @param {string} keyid
 * @param {Uint8Array} signature
 * @param {string} base
 * @returns {Promise<boolean>}
 */
export async function verifyWithDirectory(directory, keyid, signature, base) {
    for (const jwk of directory?.keys ?? []) {
        if (jwk?.kty !== 'OKP' || jwk?.crv !== 'Ed25519' || typeof jwk.x !== 'string') continue;
        if ((await thumbprint(jwk)) !== keyid) continue;
        try {
            const key = await crypto.subtle.importKey(
                'jwk',
                { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
                'Ed25519',
                false,
                ['verify']
            );
            return await crypto.subtle.verify(
                'Ed25519',
                key,
                signature,
                new TextEncoder().encode(base)
            );
        } catch {
            return false;
        }
    }
    return false;
}

// ── Fetching the directory (narrow, cached, rate limited) ────────────────────

/** @type {Map<string, { directory: object, at: number }>} */
const directories = new Map();
let fetchWindow = { start: 0, count: 0 };

/** Forget what was cached and counted. For tests. */
export function resetDirectoryCache() {
    directories.clear();
    fetchWindow = { start: 0, count: 0 };
}

/**
 * @param {{ host: string, url: string }} target
 * @param {number} nowMs
 * @returns {Promise<object | 'busy' | null>} the directory, 'busy' when over the fetch limit, null when unusable
 */
export async function fetchDirectory({ host, url }, nowMs = Date.now()) {
    const cached = directories.get(host);
    if (cached && nowMs - cached.at < CACHE_SECONDS * 1000) return cached.directory;

    if (nowMs - fetchWindow.start > 60_000) fetchWindow = { start: nowMs, count: 0 };
    if (fetchWindow.count >= FETCHES_PER_MINUTE) return 'busy';
    fetchWindow.count++;

    try {
        const response = await fetch(url, {
            redirect: 'error',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
                Accept: 'application/http-message-signatures-directory+json, application/json',
            },
            cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
        });
        const length = Number(response.headers.get('content-length') ?? 0);
        if (!response.ok || length > MAX_DIRECTORY_BYTES) return null;
        const text = await response.text();
        if (text.length > MAX_DIRECTORY_BYTES) return null;
        const directory = JSON.parse(text);
        if (!Array.isArray(directory?.keys)) return null;
        if (directories.size >= CACHE_ENTRIES) directories.delete(directories.keys().next().value);
        directories.set(host, { directory, at: nowMs });
        return directory;
    } catch {
        return null;
    }
}

// ── The check ────────────────────────────────────────────────────────────────

/**
 * Whether a request claims a Web Bot Auth signature at all: cheap, and decides whether anything
 * more is done. A request with no such signature is simply "unsigned".
 * @param {Request} request
 * @returns {boolean}
 */
export function claimsSignature(request) {
    const input = request.headers.get('signature-input');
    return Boolean(input && request.headers.get('signature') && input.includes(SIGNATURE_TAG));
}

/**
 * @param {Request} request
 * @param {{ now?: number, getDirectory?: typeof fetchDirectory }} [options] - seconds since the epoch;
 *   both exist so a test can sign a request and serve the key itself
 * @returns {Promise<SignatureResult>} 'valid', 'invalid' with a short reason, or 'unchecked' when
 *   the check could not be made (too many directory fetches)
 */
export async function verifyWebBotAuth(
    request,
    { now = Math.floor(Date.now() / 1000), getDirectory = fetchDirectory } = {}
) {
    const members = splitMembers(request.headers.get('signature-input') ?? '')
        .map(parseSignatureInput)
        .filter(Boolean);
    const input = members.find(member => member.params.tag === SIGNATURE_TAG);
    if (!input) return invalid('no-web-bot-auth-signature');

    const signature = parseSignatures(request.headers.get('signature') ?? '').get(input.label);
    if (!signature) return invalid('no-signature-for-label');

    const { created, expires, keyid } = input.params;
    if (typeof keyid !== 'string' || !keyid) return invalid('no-keyid');
    if (!Number.isInteger(expires)) return invalid('no-expires');
    if (expires < now) return invalid('expired');
    if (Number.isInteger(created) && created > now + CLOCK_SKEW_SECONDS) {
        return invalid('created-in-the-future');
    }

    // The agent's directory must be named, and covered by the signature, or anyone could add it
    if (!input.components.some(component => component.name === 'signature-agent')) {
        return invalid('signature-agent-not-covered');
    }
    const target = directoryFor(request.headers.get('signature-agent'));
    if (!target) return invalid('unusable-signature-agent');

    const base = signatureBase(request, input);
    if (base === null) return invalid('unsupported-component');

    const directory = await getDirectory(target, now * 1000);
    if (directory === 'busy') return { status: 'unchecked', reason: 'busy' };
    if (!directory) return invalid('no-key-directory');

    return (await verifyWithDirectory(directory, keyid, signature, base))
        ? { status: 'valid' }
        : invalid('signature-does-not-verify');
}

/**
 * The one value recorded for a request (worker/telemetry.js): 'unsigned' for nearly every request.
 * @param {Request} request
 * @param {Parameters<typeof verifyWebBotAuth>[1]} [options]
 * @returns {Promise<{ signature: 'unsigned' | 'valid' | 'invalid' | 'unchecked', reason?: string }>}
 */
export async function classifySignature(request, options) {
    if (!claimsSignature(request)) return { signature: 'unsigned' };
    try {
        const { status, reason } = await verifyWebBotAuth(request, options);
        return { signature: status, reason };
    } catch {
        return { signature: 'unchecked', reason: 'error' };
    }
}
