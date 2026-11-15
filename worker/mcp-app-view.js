/**
 * The HTML the show_project tool renders inside Claude (an MCP App).
 *
 * The page imports the MCP Apps client from a pinned CDN URL instead of inlining it: the
 * self-contained build is 542 KB, which would grow this Worker by about 40%. Text from the
 * tool result goes in through textContent only, never innerHTML.
 */

export const APP_CLIENT_URL =
    'https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@2.0.4/dist/src/app-with-deps.js';

export const PROJECT_VIEW_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 16px; background: Canvas; color: CanvasText; }
  h1 { font-size: 1.1rem; margin: 0 0 4px; }
  p { margin: 4px 0 12px; line-height: 1.45; }
  ul { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0 0 12px; }
  li { border: 1px solid GrayText; border-radius: 999px; padding: 2px 10px; font-size: 0.8rem; }
  a { margin-right: 12px; }
</style>
</head>
<body>
<h1 id="title">Loading</h1>
<p id="description"></p>
<ul id="tech"></ul>
<div id="links"></div>
<script type="module">
  import { App } from '${APP_CLIENT_URL}';
  const app = new App({ name: 'andernet-project-card', version: '1.0.0' });
  app.ontoolresult = ({ content, structuredContent }) => {
    let project = structuredContent;
    if (!project) {
      const text = content?.find(block => block.type === 'text')?.text;
      if (!text) return;
      try { project = JSON.parse(text); } catch { return; }
    }
    document.getElementById('title').textContent = project.title ?? project.name;
    document.getElementById('description').textContent = project.description ?? '';
    const tech = document.getElementById('tech');
    tech.replaceChildren(...(project.technologies ?? []).map(name => {
      const item = document.createElement('li');
      item.textContent = name;
      return item;
    }));
    const links = document.getElementById('links');
    links.replaceChildren(...[['Page', project.url], ['Source', project.source], ['Live demo', project.live_demo]]
      .filter(([, href]) => typeof href === 'string' && href.startsWith('https://'))
      .map(([label, href]) => {
        const link = document.createElement('a');
        link.textContent = label;
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
      }));
  };
  await app.connect();
</script>
</body>
</html>`;
