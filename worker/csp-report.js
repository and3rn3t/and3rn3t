/**
 * POST /csp-report: where browsers say what the site's Content-Security-Policy would have
 * blocked. The policy is report-only (scripts/zone-headers.mjs), so nothing is blocked; the reports
 * are the evidence for deciding whether to enforce it, and /status shows how many there were.
 *
 * Anyone can post here, so it is defensive: the body is capped, an address may send only so many
 * a minute, a report about any other site is ignored, and the answer is always an empty 204 so
 * nothing a sender does changes what they see. What is kept is three short strings, a directive,
 * where it was blocked from (a host or a keyword, never a full address) and the page path with
 * no query: no address, no user agent, no query strings.
 *
 * Two formats arrive: the legacy `report-uri` one ({"csp-report": {...}}, application/csp-report)
 * and the Reporting API's ([{ "type": "csp-violation", "body": {...} }]).
 *
 * Workers-compatible: no Node built-ins.
 */

import { methodNotAllowed } from './http.js';
import { SITE_HOST } from './site-data.js';
import { recordCsp } from './telemetry.js';

const MAX_BODY_BYTES = 8192;
/** A browser can batch several; more than this in one post is not worth reading. */
const MAX_REPORTS = 5;
const MAX_TEXT = 100;

export const DIRECTIVES = new Set([
    'default-src',
    'script-src',
    'script-src-elem',
    'script-src-attr',
    'style-src',
    'style-src-elem',
    'style-src-attr',
    'img-src',
    'font-src',
    'connect-src',
    'frame-src',
    'child-src',
    'worker-src',
    'manifest-src',
    'media-src',
    'object-src',
    'form-action',
    'base-uri',
    'frame-ancestors',
    // Trusted Types: a string reached a sink without a policy, or a policy was made that is not listed
    'require-trusted-types-for',
    'trusted-types',
]);

/** A report is JSON from a stranger: a field that is not text is no field at all. */
const asText = value => (typeof value === 'string' ? value : '');

/** Only the directives the policy has: a free-form name from the sender would be unbounded. */
export function directiveName(raw) {
    const name = asText(raw).trim().split(/\s+/)[0].toLowerCase();
    return DIRECTIVES.has(name) ? name : 'other';
}

const KEYWORDS = new Set(['inline', 'eval', 'data', 'blob', 'about', 'self', 'wasm-eval']);

/** What was blocked, as a host or a keyword. Never a path or a query, which can carry anything. */
export function blockedSource(raw) {
    const value = asText(raw).trim().toLowerCase();
    if (!value) return 'unknown';
    if (KEYWORDS.has(value)) return value;
    try {
        const { protocol, hostname } = new URL(value);
        if (hostname) return hostname.slice(0, MAX_TEXT);
        return KEYWORDS.has(protocol.slice(0, -1)) ? protocol.slice(0, -1) : 'other';
    } catch {
        return 'other';
    }
}

/**
 * The sink a Trusted Types report names, from the front of its sample ("Element innerHTML|<first
 * characters of the value>"). Only the name before the bar is read and only a known one is kept: what
 * follows is page content, which is never stored.
 */
const SINKS = new Map(
    [
        'Element innerHTML',
        'Element outerHTML',
        'Element insertAdjacentHTML',
        'ShadowRoot innerHTML',
        'Document write',
        'Document writeln',
        'Range createContextualFragment',
        'DOMParser parseFromString',
        'HTMLIFrameElement srcdoc',
        'HTMLScriptElement src',
        'HTMLScriptElement text',
        'HTMLScriptElement textContent',
        'HTMLScriptElement innerText',
        'Element setAttribute',
        'Window setTimeout',
        'Window setInterval',
        'Window eval',
        'Function',
        'eval',
    ].map(name => [name.toLowerCase(), `sink:${name.toLowerCase().replaceAll(' ', '-')}`])
);

/** @param {unknown} sample @returns {string} "sink:element-innerhtml", or "sink:other" */
export function sinkName(sample) {
    const name = asText(sample).split('|')[0].trim().toLowerCase();
    return SINKS.get(name) ?? 'sink:other';
}

/** The marker a browser puts in blocked-uri for a Trusted Types violation. */
export const TRUSTED_TYPES_SINK = 'trusted-types-sink';

/** @returns {{ host: string, path: string }} the page's host, and its path without query or fragment */
export function pageOf(documentUrl) {
    try {
        const { hostname, pathname } = new URL(asText(documentUrl));
        return { host: hostname.toLowerCase(), path: pathname.slice(0, MAX_TEXT) };
    } catch {
        return { host: '', path: '' };
    }
}

/**
 * The reports in a request body, in either format, at most MAX_REPORTS.
 * @param {string} raw
 * @returns {{ documentUrl: unknown, blockedUrl: unknown, directive: unknown, sample: unknown }[]}
 */
export function parseReports(raw) {
    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        return [];
    }
    const reports = [];
    if (Array.isArray(data)) {
        for (const entry of data) {
            if (entry?.type !== 'csp-violation' || !entry.body) continue;
            const { documentURL, blockedURL, effectiveDirective, violatedDirective, sample } =
                entry.body;
            reports.push({
                documentUrl: documentURL ?? entry.url,
                blockedUrl: blockedURL,
                directive: effectiveDirective ?? violatedDirective,
                sample,
            });
        }
    } else if (data?.['csp-report']) {
        const report = data['csp-report'];
        reports.push({
            documentUrl: report['document-uri'],
            blockedUrl: report['blocked-uri'],
            directive: report['effective-directive'] ?? report['violated-directive'],
            sample: report['script-sample'],
        });
    }
    return reports.slice(0, MAX_REPORTS);
}

/** The body as text, or null if it is larger than `max` bytes (reading stops there). */
async function readCapped(request, max) {
    if (Number(request.headers.get('Content-Length')) > max) return null;
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > max) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    return new Blob(chunks).text();
}

/**
 * @param {Request} request
 * @param {{ CSP_LIMITER?: { limit: Function }, METRICS?: object }} env
 */
export async function handleCspReport(request, env) {
    if (request.method !== 'POST') {
        return methodNotAllowed(request, 'POST');
    }
    const done = () => new Response(null, { status: 204 });

    if (env.CSP_LIMITER) {
        const key = `csp:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`;
        const { success } = await env.CSP_LIMITER.limit({ key });
        if (!success) return done();
    }
    const raw = await readCapped(request, MAX_BODY_BYTES);
    if (raw === null) return done();

    // Whatever a stranger sends, the answer is the same empty 204
    try {
        for (const report of parseReports(raw)) {
            const { host, path } = pageOf(report.documentUrl);
            // A report about some other site, or about nothing, is not about this one
            if (host !== SITE_HOST) continue;
            recordCsp(env, {
                directive: directiveName(report.directive),
                // A Trusted Types violation has no address: what matters is which sink was reached
                blocked:
                    asText(report.blockedUrl).trim().toLowerCase() === TRUSTED_TYPES_SINK
                        ? sinkName(report.sample)
                        : blockedSource(report.blockedUrl),
                path,
            });
        }
    } catch {
        // Not a report we can read
    }
    return done();
}
