/**
 * The status page (/status/): fills the structure scripts/templates/status-page.mjs draws with
 * the numbers from the Worker's /stats.
 *
 * A figure is either measured or a dash. A section the Worker could not fill (null) shows a
 * dash and says why; it never shows a zero it did not measure. Every label and value is written
 * with textContent.
 *
 * The first half is pure functions (formatting and shaping) so tests can run them without a
 * page; the second half draws.
 */

import { WORKER_BASE } from './config.js';
import { debug } from './debug.js';

const DASH = '—';
const REFRESH_MS = 5 * 60 * 1000;
/** A probe older than this means the check itself has stopped, which is worth saying. */
const STALE_PROBE_MS = 15 * 60 * 1000;

/** The vitals, with the "good" limit each is judged against (web.dev). */
export const VITALS = [
    {
        key: 'lcpMs',
        name: 'Largest Contentful Paint',
        hint: 'when the main content appears',
        limit: 2500,
        unit: 'ms',
    },
    {
        key: 'inpMs',
        name: 'Interaction to Next Paint',
        hint: 'how quickly a tap or click responds',
        limit: 200,
        unit: 'ms',
    },
    {
        key: 'cls',
        name: 'Cumulative Layout Shift',
        hint: 'how much the page jumps while loading',
        limit: 0.1,
        unit: '',
    },
    {
        key: 'ttfbMs',
        name: 'Time to First Byte',
        hint: 'how long the page takes to start arriving',
        limit: 800,
        unit: 'ms',
    },
];

// ── Pure functions ───────────────────────────────────────────────────────────

/** @param {number | null | undefined} ms @returns {string} */
export function formatMs(ms) {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return DASH;
    if (ms < 1) return '<1 ms'; // a Worker's clock only moves while it waits, so quick answers read as 0
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** A share, 0 to 1, as a percentage: whole numbers from 10% up, two decimals below. */
export function formatPercent(ratio) {
    if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return DASH;
    const percent = ratio * 100;
    if (percent === 0) return '0%';
    if (percent >= 10) return `${Math.round(percent)}%`;
    return `${Number(percent.toFixed(2))}%`;
}

/** Uptime as a percentage that never rounds up to 100% while a check has failed. */
export function formatUptime(ok, total) {
    if (!total) return DASH;
    if (ok === total) return '100%';
    return `${(Math.floor((ok / total) * 10_000) / 100).toFixed(2)}%`;
}

/** @returns {number} a number with thousands separators, or a dash */
export const formatCount = n => (Number.isFinite(n) ? Number(n).toLocaleString('en-US') : DASH);

/** "2026-11-13 00:30:54" (UTC, no zone) or an ISO string, as a Date. @returns {Date | null} */
export function parseTime(text) {
    if (!text) return null;
    const iso = /Z|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** @returns {string} "3 minutes ago", "just now" */
export function relativeTime(date, now = new Date()) {
    if (!date) return DASH;
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** The totals over the days we have. */
export function uptimeTotals(days) {
    const probes = days.reduce((sum, day) => sum + day.probes, 0);
    const ok = days.reduce((sum, day) => sum + day.ok, 0);
    return { probes, ok };
}

/**
 * The headline: is the site answering? Says "no recent check" when the checks themselves have
 * stopped, since silence is not the same as being up.
 *
 * An older Worker reported only when the last check ran (`lastProbeAt`), not whether it passed.
 * That time is used for freshness; success is never inferred from it.
 * @returns {{ state: 'up' | 'down' | 'stale' | 'unknown', label: string, detail: string }}
 */
export function verdict(uptime, now = new Date()) {
    const latest = uptime?.lastProbe ?? (uptime?.lastProbeAt ? { at: uptime.lastProbeAt } : null);
    const at = parseTime(latest?.at);
    const { ok, probes } = uptimeTotals(uptime?.days ?? []);
    if (!at) {
        // History without a latest check is not "no checks": say what is missing
        return probes
            ? {
                  state: 'unknown',
                  label: 'Latest check unavailable',
                  detail: 'Earlier checks are shown below; the most recent one could not be read.',
              }
            : {
                  state: 'unknown',
                  label: 'No checks recorded yet',
                  detail: 'The first check runs within five minutes of a deploy.',
              };
    }
    const when = relativeTime(at, now);
    if (now.getTime() - at.getTime() > STALE_PROBE_MS) {
        return { state: 'stale', label: 'No recent check', detail: `The last check was ${when}.` };
    }
    const overall = probes
        ? ` ${formatUptime(ok, probes)} of checks passed over the days shown.`
        : '';
    if (latest.ok === true) {
        return { state: 'up', label: 'Responding', detail: `Last check ${when}.${overall}` };
    }
    if (latest.ok === false) {
        return {
            state: 'down',
            label: 'Not responding',
            detail: `The last check ${when} failed.${overall}`,
        };
    }
    return {
        state: 'unknown',
        label: 'Checks are running',
        detail: `Last check ${when}; its result is not available yet.${overall}`,
    };
}

/** One cell of the uptime strip. */
export function dayState(day) {
    if (!day || !day.probes) return 'none';
    if (day.ok === day.probes) return 'ok';
    return day.ok === 0 ? 'down' : 'partial';
}

const DAY_MS = 86_400_000;

/**
 * The strip's cells: one per UTC calendar day, oldest to newest, ending today. A day with no
 * checks is an empty cell on its own date, so a gap shows as a gap and a stopped probe shows as
 * empty cells at the right instead of leaving the last recorded day at the edge.
 * @param {{ day: string, probes: number, ok: number }[] | undefined} days - only days that had checks
 * @param {number} slots
 * @param {Date} now
 * @returns {{ day: string, probes: number, ok: number }[]}
 */
export function stripCells(days, slots, now = new Date()) {
    const byDay = new Map((days ?? []).map(entry => [entry.day, entry]));
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Array.from({ length: slots }, (_, index) => {
        const day = new Date(today - (slots - 1 - index) * DAY_MS).toISOString().slice(0, 10);
        return byDay.get(day) ?? { day, probes: 0, ok: 0 };
    });
}

/** A day's date as "Thu, Nov 12". @param {string} day "2026-11-12" */
export function formatDay(day) {
    const date = new Date(`${day}T00:00:00Z`);
    return Number.isNaN(date.getTime())
        ? day
        : date.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
          });
}

/**
 * What the report count says. The page never guesses when reporting began: the Worker says (`since`,
 * a setting that is empty until someone has confirmed the policy is reporting). Before that a "0"
 * would only mean nobody could report, so it is a dash and the page says so. Reports that are
 * already arriving show whatever the setting says.
 * @param {{ last7d: number, since: string | null } | null | undefined} csp
 * @returns {{ value: string, note: string }}
 */
export function cspStatus(csp, now = new Date()) {
    if (!csp) return { value: DASH, note: 'Not available right now.' };
    const since = csp.since ? parseTime(`${csp.since}T00:00:00Z`) : null;
    const started = since !== null && since.getTime() <= now.getTime();
    if (!started && csp.last7d === 0) {
        return { value: DASH, note: 'Reporting is not switched on yet.' };
    }
    // The note stays only while the 7-day window still reaches back before reporting began
    const partial = started && now.getTime() - since.getTime() < 7 * 86_400_000;
    return {
        value: formatCount(csp.last7d),
        note: partial ? `Collected since ${formatDay(csp.since)}` : '',
    };
}

/** What the readout says for one cell. */
export function dayReadout(cell) {
    if (!cell) return 'No data for this day.';
    if (!cell.probes) return `${formatDay(cell.day)}: no checks recorded.`;
    const noun = cell.probes === 1 ? 'check' : 'checks';
    return `${formatDay(cell.day)}: ${formatCount(cell.ok)} of ${formatCount(cell.probes)} ${noun} passed (${formatUptime(cell.ok, cell.probes)}).`;
}

/** @returns {{ rating: 'good' | 'over', fill: number }} fill is 0 to 100, the share of the limit */
export function rateVital(value, limit) {
    return {
        rating: value <= limit ? 'good' : 'over',
        fill: Math.min(100, Math.round((value / limit) * 1000) / 10),
    };
}

/** The figure for a vital, e.g. "440 ms" or "0.02". */
export function formatVital(vital, value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
    return vital.unit === 'ms' ? formatMs(value) : String(value);
}

// ── Drawing ──────────────────────────────────────────────────────────────────

/** @returns {HTMLElement} an element with a class and text, written as text */
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

const $ = (root, selector) => root.querySelector(selector);

function setText(root, selector, text) {
    const node = $(root, selector);
    if (node) node.textContent = text;
}

/** A meter row: name, a bar filled to `fill` percent, and the figure with its verdict in words. */
function meterRow({ name, hint, fill, figure, note, rating }) {
    const row = el('li', 'meter');
    if (rating) row.dataset.rating = rating;
    const label = el('div', 'meter__label');
    label.append(el('span', 'meter__name', name));
    if (hint) label.append(el('span', 'meter__hint', hint));
    const track = el('div', 'meter__track');
    const bar = el('div', 'meter__fill');
    bar.style.setProperty('--w', `${fill}%`);
    track.append(bar);
    const value = el('div', 'meter__figure');
    value.append(el('span', 'meter__value', figure));
    if (note) value.append(el('span', 'meter__note', note));
    row.append(label, track, value);
    return row;
}

function renderVerdict(root, uptime, now) {
    const result = verdict(uptime, now);
    const box = $(root, '[data-verdict]');
    box.dataset.state = result.state;
    setText(root, '[data-verdict-label]', result.label);
    setText(root, '[data-verdict-detail]', result.detail);
}

function renderApi(root, api) {
    const windows = { '24h': api?.last24h, '7d': api?.last7d };
    for (const [suffix, data] of Object.entries(windows)) {
        const sub = suffix === '7d';
        const text = {
            error: data ? formatPercent(data.errorRate) : DASH,
            p50: data ? formatMs(data.p50Ms) : DASH,
            p95: data ? formatMs(data.p95Ms) : DASH,
        };
        for (const [metric, value] of Object.entries(text)) {
            setText(
                root,
                `[data-stat="${metric}-${suffix}"]`,
                sub ? `Last 7 days: ${value}` : value
            );
        }
    }
}

function renderVitals(root, vitals) {
    const list = $(root, '[data-vitals]');
    list.replaceChildren(
        ...VITALS.map(vital => {
            const value = vitals?.[vital.key];
            const limitText = vital.unit === 'ms' ? formatMs(vital.limit) : String(vital.limit);
            if (value === null || value === undefined) {
                return meterRow({
                    name: vital.name,
                    hint: vital.hint,
                    fill: 0,
                    figure: DASH,
                    note: 'Not available yet',
                });
            }
            const { rating, fill } = rateVital(value, vital.limit);
            return meterRow({
                name: vital.name,
                hint: vital.hint,
                fill,
                figure: formatVital(vital, value),
                note:
                    rating === 'good'
                        ? `Good (limit ${limitText})`
                        : `Needs work (limit ${limitText})`,
                rating,
            });
        })
    );
}

/** The report count, and which directives the reports are about (only those with reports). */
function renderCsp(root, csp, now) {
    const { value, note } = cspStatus(csp, now);
    setText(root, '[data-stat="csp-7d"]', value);
    setText(root, '[data-stat="csp-note"]', note || '\u00a0');
    const reports = csp?.byDirective ?? [];
    const list = $(root, '[data-rank="csp"]');
    if (!reports.length) {
        list.replaceChildren();
        return;
    }
    const max = Math.max(...reports.map(row => row.count));
    list.replaceChildren(
        ...reports.map(row => {
            const item = el('li', 'rank__row');
            const bar = el('span', 'rank__bar');
            bar.style.setProperty('--w', `${Math.max(2, (row.count / max) * 100)}%`);
            const track = el('span', 'rank__track');
            track.append(bar);
            item.append(
                el('span', 'rank__name', row.directive),
                track,
                el('span', 'rank__value', formatCount(row.count))
            );
            return item;
        })
    );
}

function renderEdge(root, edge) {
    const list = $(root, '[data-edge]');
    list.replaceChildren(
        edge
            ? meterRow({
                  name: 'Pages and files answered by Cloudflare',
                  hint: 'without asking GitHub, last 24 hours',
                  fill: Math.round(edge.answeredAtEdge * 100),
                  figure: formatPercent(edge.answeredAtEdge),
              })
            : meterRow({
                  name: 'Pages and files answered by Cloudflare',
                  fill: 0,
                  figure: DASH,
                  note: 'No data yet',
              })
    );
}

/** A ranked list: the largest first, each bar scaled to the largest, the value at its tip. */
function renderRank(root, name, rows, empty) {
    const list = $(root, `[data-rank="${name}"]`);
    // null means the Worker could not read it; only an empty list means there was none
    if (!Array.isArray(rows)) {
        list.replaceChildren(el('li', 'rank__empty', 'Not available right now.'));
        return;
    }
    if (!rows.length) {
        list.replaceChildren(el('li', 'rank__empty', empty));
        return;
    }
    const max = Math.max(...rows.map(row => row.value));
    list.replaceChildren(
        ...rows.map(row => {
            const item = el('li', 'rank__row');
            const bar = el('span', 'rank__bar');
            bar.style.setProperty('--w', `${max ? Math.max(2, (row.value / max) * 100) : 0}%`);
            const track = el('span', 'rank__track');
            track.append(bar);
            item.append(
                el('span', 'rank__name', row.name),
                track,
                el('span', 'rank__value', row.label)
            );
            return item;
        })
    );
}

function renderAgents(root, stats) {
    setText(
        root,
        '[data-stat="agent-share"]',
        stats.clients ? formatPercent(stats.clients.agentShare) : DASH
    );
    renderRank(
        root,
        'crawlers',
        stats.crawlers?.map(row => ({
            name: row.category,
            value: row.requests,
            label: formatCount(row.requests),
        })),
        'No verified crawler traffic in the last 7 days.'
    );
    renderRank(
        root,
        'tools',
        stats.mcp?.map(row => ({
            name: row.tool,
            value: row.calls,
            label: row.errors
                ? `${formatCount(row.calls)} (${formatCount(row.errors)} failed)`
                : formatCount(row.calls),
        })),
        'No MCP tool calls in the last 7 days.'
    );
}

/** The uptime strip, its readout, and the table view. Returns nothing; wires pointer and keys. */
function renderUptime(root, uptime, now) {
    const strip = $(root, '[data-uptime]');
    const readout = $(root, '[data-uptime-readout]');
    const slots = globalThis.matchMedia?.('(max-width: 40rem)').matches ? 30 : 90;
    const cells = stripCells(uptime?.days, slots, now);
    const totals = uptimeTotals(uptime?.days ?? []);

    const idle = uptime?.days?.length
        ? `${formatUptime(totals.ok, totals.probes)} of ${formatCount(totals.probes)} checks passed over the ${uptime.days.length === 1 ? 'day' : `${uptime.days.length} days`} shown.`
        : 'No checks recorded yet.';
    readout.textContent = idle;

    strip.replaceChildren(
        ...cells.map(cell => {
            const node = el('span', `uptime__day uptime__day--${dayState(cell)}`);
            node.setAttribute('aria-hidden', 'true');
            return node;
        })
    );

    const nodes = [...strip.children];
    let active = -1;
    const show = index => {
        nodes[active]?.classList.remove('is-active');
        active = index;
        if (index < 0) {
            readout.textContent = idle;
            return;
        }
        nodes[index].classList.add('is-active');
        readout.textContent = dayReadout(cells[index]);
    };
    const indexAt = clientX => {
        const box = strip.getBoundingClientRect();
        const index = Math.floor(((clientX - box.left) / box.width) * cells.length);
        return Math.min(cells.length - 1, Math.max(0, index));
    };

    // Each handler is replaced, not added, so a refresh does not stack listeners
    strip.onpointermove = event => show(indexAt(event.clientX));
    strip.onpointerleave = () => {
        if (document.activeElement !== strip) show(-1);
    };
    strip.onfocus = () => show(cells.length - 1);
    strip.onblur = () => show(-1);
    strip.onkeydown = event => {
        const moves = { ArrowLeft: -1, ArrowRight: 1 };
        if (event.key in moves) {
            show(
                Math.min(
                    cells.length - 1,
                    Math.max(0, (active < 0 ? cells.length - 1 : active) + moves[event.key])
                )
            );
        } else if (event.key === 'Home') {
            show(0);
        } else if (event.key === 'End') {
            show(cells.length - 1);
        } else {
            return;
        }
        event.preventDefault();
    };

    // The table view carries every value, so nothing depends on hovering
    const host = $(root, '[data-table="uptime"]');
    if (!uptime?.days?.length) {
        host.replaceChildren(el('p', 'status-note', 'No checks recorded yet.'));
        return;
    }
    const table = el('table', 'status-table__grid');
    const head = el('tr');
    for (const name of ['Day', 'Checks passed', 'Checks', 'Share'])
        head.append(el('th', undefined, name));
    const thead = el('thead');
    thead.append(head);
    table.append(thead);
    const body = el('tbody');
    for (const day of [...uptime.days].reverse()) {
        const row = el('tr');
        row.append(
            el('td', undefined, formatDay(day.day)),
            el('td', undefined, formatCount(day.ok)),
            el('td', undefined, formatCount(day.probes)),
            el('td', undefined, formatUptime(day.ok, day.probes))
        );
        body.append(row);
    }
    table.append(body);
    host.replaceChildren(table);
}

/**
 * Draw everything from one /stats answer.
 * @param {Element} root
 * @param {object} stats
 * @param {Date} [now]
 */
export function renderStatus(root, stats, now = new Date()) {
    renderVerdict(root, stats.uptime, now);
    renderUptime(root, stats.uptime, now);
    renderApi(root, stats.api);
    renderVitals(root, stats.vitals);
    renderEdge(root, stats.edge);
    renderCsp(root, stats.csp, now);
    renderAgents(root, stats);
    const generated = parseTime(stats.generatedAt);
    setText(
        root,
        '[data-updated]',
        generated ? `Updated ${relativeTime(generated, now)}. Refreshes every five minutes.` : ''
    );
}

const NO_STATS = {
    api: { last24h: null, last7d: null },
    mcp: null,
    clients: null,
    uptime: null,
    vitals: null,
    crawlers: null,
    csp: null,
    edge: null,
};

/**
 * What the page shows when the numbers cannot be had: dashes, and the reason. Used for a failed
 * refresh as well as a failed first load: an old "Responding, last check just now" left on the
 * screen after the data stopped coming would be a claim nothing is backing any more.
 */
function renderUnavailable(root, now = new Date()) {
    renderStatus(root, NO_STATS, now);
    $(root, '[data-verdict]').dataset.state = 'unknown';
    setText(root, '[data-verdict-label]', 'Numbers unavailable');
    setText(
        root,
        '[data-verdict-detail]',
        'The stats could not be loaded just now. They are not made up: try again in a minute.'
    );
    setText(root, '[data-updated]', 'Could not update. Trying again in five minutes.');
}

/** Fetch the stats and draw them; on any failure, draw the unavailable state. */
export async function loadStatus(root) {
    try {
        const response = await fetch(`${WORKER_BASE}/stats`, {
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        renderStatus(root, await response.json());
    } catch (err) {
        debug.warn('[Status] Could not load stats:', err.message);
        renderUnavailable(root);
    }
}

export async function initStatusPage() {
    const root = document.querySelector('[data-status-root]');
    if (!root) return;
    root.setAttribute('aria-busy', 'true');
    await loadStatus(root);
    root.removeAttribute('aria-busy');
    setInterval(() => {
        if (!document.hidden) loadStatus(root);
    }, REFRESH_MS);
}

initStatusPage();
