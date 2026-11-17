/**
 * Test helper: sign a request the way a Web Bot Auth agent does (RFC 9421, a real Ed25519 key).
 * Overrides break one thing at a time.
 */
import { thumbprint } from '../../worker/web-bot-auth.js';

export const NOW = 1_800_000_000;
export const AGENT = '"https://agent.example.com"';
export const URL_SIGNED = 'https://andernet.dev/mcp';

const base64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));

export async function makeAgent() {
    const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    return { pair, jwk, keyid: await thumbprint(jwk), directory: { keys: [jwk] } };
}

/** A request signed the way an agent signs one. Overrides break one thing at a time. */
export async function signed(agent, overrides = {}) {
    const {
        url = URL_SIGNED,
        method = 'POST',
        components = ['@authority', 'signature-agent'],
        created = NOW - 5,
        expires = NOW + 300,
        keyid = agent.keyid,
        tag = 'web-bot-auth',
        signatureAgent = AGENT,
        label = 'sig1',
        tamper,
    } = overrides;
    const params = `(${components.map(name => `"${name}"`).join(' ')});created=${created};expires=${expires};keyid="${keyid}";tag="${tag}"`;
    const request = new Request(url, { method, headers: { 'Signature-Agent': signatureAgent } });
    const derived = {
        '@authority': new URL(url).host,
        '@method': method,
        '@path': new URL(url).pathname,
    };
    const lines = components.map(
        name =>
            `"${name}": ${derived[name] ?? (name.startsWith('@') ? 'x' : request.headers.get(name))}`
    );
    lines.push(`"@signature-params": ${params}`);
    const bytes = await crypto.subtle.sign(
        'Ed25519',
        agent.pair.privateKey,
        new TextEncoder().encode(lines.join('\n'))
    );
    const headers = new Headers(request.headers);
    headers.set('Signature-Input', `${label}=${params}`);
    headers.set('Signature', `${label}=:${base64(bytes)}:`);
    return new Request(tamper ?? url, { method, headers });
}
