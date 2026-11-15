/**
 * The HTML the show_status tool renders inside Claude (an MCP App): the site's health as a panel,
 * the same numbers as /status/ and get_site_stats.
 *
 * The drawing code is a plain string (STATUS_RENDER_SOURCE) so a test can run it against sample
 * data in jsdom; it is not a function that is stringified, because the Worker's bundler can wrap
 * functions in helpers that would not exist inside the iframe. Text from the data goes in through
 * textContent only, never innerHTML, and every section can be missing: stats.js gives null for a
 * query that failed, and the panel then says so instead of showing a zero.
 */

import { APP_CLIENT_URL } from './mcp-app-view.js';

export const STATUS_RENDER_SOURCE = `
function renderStatus(stats, doc) {
  const el = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const ms = value => (number(value) === null ? '–' : value >= 1000 ? (value / 1000).toFixed(1) + ' s' : Math.round(value) + ' ms');
  const percent = (value, digits) => (number(value) === null ? '–' : (value * 100).toFixed(digits) + '%');
  const stat = (label, value) => {
    const box = el('div', null, 'stat');
    box.append(el('div', value, 'stat__value'), el('div', label, 'stat__label'));
    return box;
  };
  const heading = text => el('h2', text);
  const sections = [];

  // Is the site answering, and for how long has it been
  const uptime = stats?.uptime;
  const days = Array.isArray(uptime?.days) ? uptime.days : [];
  const probes = days.reduce((sum, day) => sum + (number(day.probes) ?? 0), 0);
  const passed = days.reduce((sum, day) => sum + (number(day.ok) ?? 0), 0);
  const last = uptime?.lastProbe;
  const head = el('div', null, 'head');
  if (!last) {
    head.append(el('p', 'No recent check', 'headline headline--unknown'));
  } else {
    head.append(el('p', last.ok ? 'andernet.dev is answering' : 'The last check failed', 'headline ' + (last.ok ? 'headline--ok' : 'headline--bad')));
    head.append(el('p', 'Last check ' + String(last.at).slice(0, 16).replace('T', ' ') + ' UTC', 'sub'));
  }
  if (probes > 0) {
    head.append(el('p', (passed / probes * 100).toFixed(2) + '% of ' + probes + ' checks passed over ' + days.length + ' days', 'sub'));
  }
  sections.push(head);

  if (days.length) {
    const strip = el('div', null, 'strip');
    for (const day of days) {
      const share = number(day.probes) > 0 ? day.ok / day.probes : null;
      const level = share === null ? 'none' : share >= 0.999 ? 'ok' : share >= 0.99 ? 'warn' : 'bad';
      const cell = el('span', null, 'cell cell--' + level);
      cell.title = day.day + (share === null ? '' : ': ' + (share * 100).toFixed(1) + '%');
      strip.append(cell);
    }
    sections.push(strip);
  }

  // The API, and what real visitors measure
  const api = stats?.api?.last24h;
  sections.push(heading('API, last 24 hours'));
  if (api) {
    const grid = el('div', null, 'grid');
    grid.append(stat('median', ms(api.p50Ms)), stat('slowest 5%', ms(api.p95Ms)), stat('errors', percent(api.errorRate, 2)));
    sections.push(grid);
  } else {
    sections.push(el('p', 'Nothing measured yet.', 'sub'));
  }

  const vitals = stats?.vitals;
  sections.push(heading('Real visitors, 75th percentile'));
  if (vitals) {
    const grid = el('div', null, 'grid');
    grid.append(
      stat('largest paint', ms(vitals.lcpMs)),
      stat('first byte', ms(vitals.ttfbMs)),
      stat('layout shift', number(vitals.cls) === null ? '–' : vitals.cls.toFixed(2)),
      stat('interaction', ms(vitals.inpMs))
    );
    sections.push(grid);
  } else {
    sections.push(el('p', 'Not enough visitors measured yet.', 'sub'));
  }

  // What agents use
  const tools = Array.isArray(stats?.mcp) ? stats.mcp : [];
  if (tools.length) {
    sections.push(heading('MCP tools, last 7 days'));
    const list = el('ul', null, 'tools');
    for (const tool of tools.slice(0, 6)) {
      const failed = number(tool.errors) > 0 ? ', ' + tool.errors + ' failed' : '';
      list.append(el('li', tool.tool + ': ' + tool.calls + (tool.calls === 1 ? ' call' : ' calls') + failed));
    }
    sections.push(list);
  }

  const foot = el('p', null, 'sub foot');
  foot.append('Updated ' + String(stats?.generatedAt ?? '').slice(0, 16).replace('T', ' ') + ' UTC. ');
  const link = el('a', 'Full status page');
  link.href = 'https://andernet.dev/status/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  foot.append(link);
  sections.push(foot);

  doc.getElementById('root').replaceChildren(...sections);
}
`;

export const STATUS_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; --ok: #1a7f37; --warn: #9a6700; --bad: #cf222e; }
  @media (prefers-color-scheme: dark) { :root { --ok: #3fb950; --warn: #d29922; --bad: #f85149; } }
  body { margin: 0; padding: 16px; background: Canvas; color: CanvasText; }
  h2 { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; margin: 16px 0 8px; opacity: 0.7; }
  p { margin: 2px 0; }
  .headline { font-size: 1.15rem; font-weight: 600; }
  .headline--ok { color: var(--ok); } .headline--bad { color: var(--bad); } .headline--unknown { color: GrayText; }
  .sub { font-size: 0.85rem; opacity: 0.75; }
  .strip { display: flex; gap: 2px; margin-top: 10px; }
  .cell { flex: 1; height: 22px; border-radius: 2px; background: GrayText; opacity: 0.35; }
  .cell--ok { background: var(--ok); opacity: 1; } .cell--warn { background: var(--warn); opacity: 1; } .cell--bad { background: var(--bad); opacity: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
  .stat { border: 1px solid GrayText; border-radius: 8px; padding: 8px 10px; }
  .stat__value { font-size: 1.1rem; font-weight: 600; }
  .stat__label { font-size: 0.75rem; opacity: 0.7; }
  .tools { margin: 0; padding-left: 18px; font-size: 0.9rem; }
  .foot { margin-top: 16px; }
</style>
</head>
<body>
<div id="root"><p class="sub">Loading</p></div>
<script type="module">
  import { App } from '${APP_CLIENT_URL}';
  ${STATUS_RENDER_SOURCE}
  const app = new App({ name: 'andernet-status-panel', version: '1.0.0' });
  app.ontoolresult = ({ content, structuredContent }) => {
    let stats = structuredContent;
    if (!stats) {
      const text = content?.find(block => block.type === 'text')?.text;
      if (!text) return;
      try { stats = JSON.parse(text); } catch { return; }
    }
    renderStatus(stats, document);
  };
  await app.connect();
</script>
</body>
</html>`;
