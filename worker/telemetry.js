/**
 * What the Worker reports about itself: one Analytics Engine data point per request and per MCP
 * tool call, one JSON log line per event, and trace spans.
 *
 * Privacy: no IP address and no user-agent string is stored. The user agent is reduced to
 * "browser", "agent" or "other" before it is written, and the path to a fixed route name.
 *
 * Every function does nothing when its binding is absent (local dev, tests), the same way
 * MCP_LIMITER does in index.js.
 *
 * Data point layout in the `portfolio_metrics` dataset (blob1 is the record kind, so one dataset
 * holds every kind):
 *   request: index1 route; blob1 "request", blob2 method, blob3 colo, blob4 client; double1 status, double2 ms
 *   tool:    index1 tool;  blob1 "tool",    blob2 "ok" | "error";                  double1 0,      double2 ms
 *   csp:     index1 directive; blob1 "csp", blob2 blocked host or keyword, blob3 page path; double1 1
 *   probe:   index1 "home"; blob1 "probe",   blob2 "ok" | "fail";                  double1 status, double2 ms
 *
 * Workers-compatible: no Node built-ins.
 */

/** Routes worth naming. Anything else is "other", so the path can never grow the cardinality. */
const ROUTES = new Set([
    '/health',
    '/views',
    '/guestbook',
    '/activity',
    '/mcp',
    '/openapi.json',
    '/edge',
    '/stats',
    '/presence',
    '/csp-report',
]);

/**
 * @param {string} pathname - the request path, with or without the /api prefix
 * @returns {string} a fixed route name
 */
export function routeLabel(pathname) {
    const path = pathname.startsWith('/api/') ? pathname.slice('/api'.length) : pathname;
    if (ROUTES.has(path)) return path;
    return path.startsWith('/.well-known/') ? '/.well-known' : 'other';
}

const AGENT_PATTERN =
    /bot|crawler|spider|gpt|claude|anthropic|perplexity|openai|mcp|curl|python|node|axios|go-http|java|okhttp|wget/i;

/**
 * @param {string | null | undefined} userAgent
 * @returns {'browser' | 'agent' | 'other'}
 */
export function clientKind(userAgent) {
    if (!userAgent) return 'other';
    if (AGENT_PATTERN.test(userAgent)) return 'agent';
    return /mozilla\//i.test(userAgent) ? 'browser' : 'other';
}

/**
 * @param {{ METRICS?: { writeDataPoint: (point: object) => void } }} env
 * @param {{ route: string, method: string, status: number, ms: number, colo?: string, client: string }} point
 */
export function recordRequest(env, { route, method, status, ms, colo, client }) {
    try {
        env.METRICS?.writeDataPoint({
            indexes: [route],
            blobs: ['request', method, colo ?? 'unknown', client],
            doubles: [status, Math.round(ms)],
        });
    } catch {
        // Telemetry must never break a response.
    }
}

/**
 * @param {{ METRICS?: { writeDataPoint: (point: object) => void } }} env
 * @param {{ tool: string, ok: boolean, ms: number }} point
 */
export function recordTool(env, { tool, ok, ms }) {
    try {
        env.METRICS?.writeDataPoint({
            indexes: [tool],
            blobs: ['tool', ok ? 'ok' : 'error'],
            doubles: [0, Math.round(ms)],
        });
    } catch {
        // Telemetry must never break a response.
    }
}

/**
 * @param {{ METRICS?: { writeDataPoint: (point: object) => void } }} env
 * @param {{ ok: boolean, status: number, ms: number }} point
 */
export function recordProbe(env, { ok, status, ms }) {
    try {
        env.METRICS?.writeDataPoint({
            indexes: ['home'],
            blobs: ['probe', ok ? 'ok' : 'fail'],
            doubles: [status, Math.round(ms)],
        });
    } catch {
        // Telemetry must never break a response.
    }
}

/**
 * One Content-Security-Policy report: what would have been blocked, and on which page. No
 * address and no user agent: see csp-report.js.
 * @param {{ METRICS?: { writeDataPoint: (point: object) => void } }} env
 * @param {{ directive: string, blocked: string, path: string }} point
 */
export function recordCsp(env, { directive, blocked, path }) {
    try {
        env.METRICS?.writeDataPoint({
            indexes: [directive],
            blobs: ['csp', blocked, path],
            doubles: [1],
        });
    } catch {
        // Telemetry must never break a response.
    }
}

/**
 * One JSON object per line, so Workers Logs can filter on its fields.
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function log(level, event, fields = {}) {
    console[level](JSON.stringify({ event, ...fields }));
}

/**
 * Run `task` inside a named trace span. Without tracing (tests, local dev, tracing off) it is
 * just `task()`.
 * @template T
 * @param {{ tracing?: { enterSpan: (name: string, task: () => T) => T } } | undefined} ctx
 * @param {string} name
 * @param {() => T} task
 * @returns {T}
 */
export function withSpan(ctx, name, task) {
    return ctx?.tracing ? ctx.tracing.enterSpan(name, task) : task();
}

/** Name the invocation's root span after the route, so traces group by route and not by URL. */
export function nameRootSpan(ctx, method, route) {
    ctx?.tracing?.getActiveSpan?.()?.updateName?.(`${method} ${route}`);
}
