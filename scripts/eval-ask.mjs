#!/usr/bin/env node
/**
 * Does the on-device "ask" pick the right pages? Runs modules/ask.js, unchanged, in real Chrome
 * with its real built-in model, over questions whose answers are known from the site's own data,
 * and reports how often the right page is picked, whether it ever names one that is not there
 * (the plan's reason to drop the feature) and whether it declines a question the site cannot answer.
 *
 * By hand, not in CI: it needs Google Chrome with the Prompt API (Chrome 148 or later), a GPU, and the
 * model, a download of several gigabytes that this script will NOT start unless it is given --download.
 * The profile (where the model is kept) defaults to a folder in the system temp directory and is
 * reused between runs, so the download happens once; delete the folder to free the space.
 *
 * Usage: pnpm eval:ask --serve                     (recommended: open the printed page in your own Chrome and click Run)
 *        pnpm eval:ask [--download] [--headed] [--profile <dir>] [--chrome <path>]   (drive a separate Chrome)
 * Exit: 0 ran; 1 the model named a page that is not on the site; 2 it could not run (say why).
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEntries } from '../modules/ask.js';

const ROOT = join(import.meta.dirname, '..');
const MIME = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

/**
 * Questions with a known answer, made from the data files so they cannot go stale.
 * @param {{ projects: object[] }} projectsData
 * @param {{ posts: object[] }} postsData
 * @returns {{ id: string, question: string, expect: string[], none?: boolean }[]}
 */
export function buildQuestions(projectsData, postsData) {
  const projects = projectsData.projects;
  const posts = postsData.posts;
  const questions = [];
  const title = project => project.displayName || project.name;

  // Asking about a project by name
  for (const project of projects.slice(0, 3)) {
    questions.push({
      id: `name:${project.name}`,
      question: `What is ${title(project)} about?`,
      expect: [`project:${project.name}`],
    });
  }
  // A technology that only one project uses
  const uses = new Map();
  for (const project of projects) {
    for (const tech of project.technologies ?? []) {
      uses.set(tech, [...(uses.get(tech) ?? []), project.name]);
    }
  }
  for (const [tech, names] of [...uses].filter(([, names]) => names.length === 1).slice(0, 4)) {
    questions.push({
      id: `tech:${tech}`,
      question: `Which project uses ${tech}?`,
      expect: names.map(name => `project:${name}`),
    });
  }
  // A topic a post is tagged with, that no other post has
  const tagged = new Map();
  for (const post of posts) {
    for (const tag of post.tags ?? []) tagged.set(tag, [...(tagged.get(tag) ?? []), post.slug]);
  }
  for (const [tag, slugs] of [...tagged].filter(([, slugs]) => slugs.length === 1).slice(0, 3)) {
    questions.push({
      id: `tag:${tag}`,
      question: `Is there anything written about ${tag}?`,
      expect: slugs.map(slug => `post:${slug}`),
    });
  }
  // The start of a project's description, for a project whose description does not give its name away
  const start = project => project.description.split(/\s+/).slice(0, 8).join(' ');
  const namesItself = project =>
    [project.name, project.displayName]
      .filter(Boolean)
      .some(name => start(project).toLowerCase().includes(name.toLowerCase()));
  for (const project of projects
    .filter(item => item.description && !namesItself(item))
    .slice(3, 6)) {
    questions.push({
      id: `description:${project.name}`,
      question: `Which project is this: ${start(project)}`,
      expect: [`project:${project.name}`],
    });
  }
  // Nothing on the site answers these, and nothing on it is about them (a first try asked about the
  // weather, and the portfolio has a weather app: picking it was fair, so it proved nothing)
  questions.push(
    { id: 'none:geography', question: 'What is the capital of Australia?', expect: [], none: true },
    { id: 'none:cooking', question: 'Give me a recipe for lasagna.', expect: [], none: true }
  );
  return questions;
}

/**
 * @param {{ id: string, expect: string[], none?: boolean }} question
 * @param {{ status: string, ids?: string[], invalid?: number }} result
 */
export function score(question, result) {
  const ids = result.ids ?? [];
  if (question.none) return { top1: ids.length === 0, anywhere: ids.length === 0 };
  return {
    top1: question.expect.includes(ids[0]),
    anywhere: question.expect.some(id => ids.includes(id)),
  };
}

/**
 * Text that is safe to print: control characters (a newline that would forge a report line, an escape code that
 * would drive the terminal; the second pattern catches those) become "?". Everything printed from a posted result goes through it.
 * @param {unknown} value
 * @returns {string}
 */
export function printable(value) {
  return String(value)
    .replace(/[\r\n]/g, '?')
    .replace(/[^\x20-\x7e]/g, '?');
}

const MAX_PICKS = 3;
const MAX_BODY_BYTES = 64 * 1024;

// Nothing the page posts is ever printed. A posted number only chooses which entry of a fixed table is, a
// posted id is replaced by the site's own id string, and a status by a constant: so a result cannot put text
// of its own in the report (CodeQL's js/log-injection treats every value derived from a request as tainted,
// so cleaning the value is not enough; not using it is).
const MS_STEP = 10;
const MS_LABELS = Array.from({ length: 600_000 / MS_STEP + 1 }, (_, index) =>
  String(index * MS_STEP)
);
const COUNT_LABELS = Array.from({ length: 201 }, (_, index) => String(index));
const STATUS_LABELS = {
  ok: 'ok',
  unavailable: 'unavailable',
  'too-long': 'too-long',
  error: 'error',
  cancelled: 'cancelled',
};

/** @param {number} ms @returns {string} the time in milliseconds, to the nearest ten, as text from the table */
export function msLabel(ms) {
  const step = Math.round(ms / MS_STEP);
  return MS_LABELS[step < 0 ? 0 : Math.min(step, MS_LABELS.length - 1)];
}

/** @param {number} count @returns {string} a small count as text from the table (200 and over read as 200) */
export function countLabel(count) {
  return COUNT_LABELS[count < 0 ? 0 : Math.min(count, COUNT_LABELS.length - 1)];
}

/**
 * The results the page posts back, checked. Anything that can reach localhost can post here, so nothing is
 * taken on trust: a result must name one of the questions, carry a known status, at most three page ids that
 * are on the site, and numbers in range. What comes out holds the site's own strings and the question's, never
 * the posted text. A failure says only that a result is malformed and never echoes what was posted.
 * @param {string} body
 * @param {{ id: string, expect: string[], none?: boolean }[]} questions
 * @param {string[]} knownIds - every project and post id on the site
 * @returns {{ question: object, result: { status: string, ids: string[], invalid: number }, ms: number, top1: boolean, anywhere: boolean }[]}
 */
export function readResults(body, questions, knownIds) {
  let posted;
  try {
    posted = JSON.parse(body);
  } catch {
    throw new Error('the results are not JSON');
  }
  if (!Array.isArray(posted) || posted.length === 0 || posted.length > questions.length) {
    throw new Error('the results are not a list of the expected length');
  }
  const whole = (value, max) => (Number.isInteger(value) && value >= 0 && value <= max ? value : 0);
  const own = new Map(knownIds.map(id => [id, id]));
  return posted.map(row => {
    const question = questions.find(item => item.id === row?.id);
    const ids = row?.result?.ids ?? [];
    const valid =
      question &&
      Object.hasOwn(STATUS_LABELS, row.result?.status) &&
      Array.isArray(ids) &&
      ids.length <= MAX_PICKS &&
      ids.every(id => typeof id === 'string' && own.has(id));
    if (!valid) throw new Error('a result is malformed');
    const result = {
      status: STATUS_LABELS[row.result.status],
      ids: ids.map(id => own.get(id)),
      invalid: whole(row.result.invalid, 10),
    };
    return { question, result, ms: whole(row.ms, 3_600_000), ...score(question, result) };
  });
}

/**
 * Print one line per question and the totals, and say whether the model named a page that is not on the site.
 * @param {{ question: { id: string, none?: boolean }, result: { ids?: string[], status: string, invalid?: number }, ms: number, top1: boolean, anywhere: boolean }[]} rows
 * @returns {0 | 1} the exit code: 1 if any page id was not on the site
 */
export function summarize(rows) {
  for (const row of rows) {
    const mark = row.anywhere ? (row.top1 ? 'top' : 'in ') : 'MISS';
    const shown = (row.result.ids ?? [row.result.status]).join(', ') || '(none)';
    console.log(
      `${mark}  ${msLabel(row.ms).padStart(5)} ms  ${row.question.id.padEnd(34)} -> ${shown}`
    );
  }
  // How many questions had a page id that is not on the site, as a count of rows, not a posted number
  const withInvalid = rows.filter(row => row.result.invalid > 0).length;
  const asked = rows.filter(row => !row.question.none);
  const rate = (rowsIn, key) => `${rowsIn.filter(row => row[key]).length}/${rowsIn.length}`;
  const sorted = [...rows].sort((a, b) => a.ms - b.ms);
  console.log(
    `\nright page first: ${rate(asked, 'top1')}   right page among the picks: ${rate(asked, 'anywhere')}` +
      `   declines what the site cannot answer: ${rate(
        rows.filter(row => row.question.none),
        'top1'
      )}` +
      `   questions with a page id not on the site: ${countLabel(withInvalid)}   median ${msLabel(sorted[Math.floor(rows.length / 2)]?.ms ?? 0)} ms`
  );
  return withInvalid > 0 ? 1 : 0;
}

/** The repo's files over http on localhost, so the page is a secure context with the real modules. */
function serve(extra) {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (path.includes('..')) return response.writeHead(403).end();
    if (extra?.(request, response, path)) return undefined;
    try {
      const body = readFileSync(join(ROOT, path === '/' ? 'index.html' : path));
      response.writeHead(200, {
        'Content-Type': MIME[extname(path)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

/** The page --serve shows: the same questions, run in the visitor's own Chrome by a click. */
const EVAL_PAGE = `<!doctype html>
<meta charset="utf-8" />
<title>Ask the portfolio: eval</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 62rem; padding: 0 1rem; }
  pre { background: #f0f0ec; padding: 1rem; overflow: auto; }
  button { font: inherit; padding: 0.5rem 1rem; }
</style>
<h1>Ask the portfolio: eval</h1>
<p id="status">Checking the model…</p>
<button id="run" disabled>Run the questions</button>
<pre id="out"></pre>
<script type="module">
  import { askAvailability, askPortfolio, buildEntries } from '/modules/ask.js';
  const status = document.getElementById('status');
  const out = document.getElementById('out');
  const run = document.getElementById('run');
  const state = await askAvailability();
  status.textContent =
    state === 'unavailable'
      ? 'This browser cannot run the model here.'
      : 'Model: ' + state + (state === 'available' ? '.' : ' (running will download it: several gigabytes).');
  if (state !== 'unavailable') run.disabled = false;
  run.onclick = async () => {
    run.disabled = true;
    const [questions, projects, posts] = await Promise.all([
      fetch('questions.json').then(r => r.json()),
      fetch('/projects-data.json').then(r => r.json()),
      fetch('/posts-data.json').then(r => r.json()),
    ]);
    const entries = buildEntries(projects, posts);
    const rows = [];
    for (const question of questions) {
      const started = performance.now();
      status.textContent = 'Asking: ' + question.question;
      const result = await askPortfolio({
        question: question.question,
        entries,
        onDownload: fraction => (status.textContent = 'Downloading the model... ' + Math.round(fraction * 100) + '%'),
      });
      const ms = Math.round(performance.now() - started);
      rows.push({ id: question.id, result, ms });
      out.textContent += question.id.padEnd(34) + ' -> ' + ((result.ids ?? [result.status]).join(', ') || '(none)') + '  (' + ms + ' ms)\\n';
    }
    await fetch('result', { method: 'POST', body: JSON.stringify(rows) });
    status.textContent = 'Done. The results are in the terminal; you can close this tab.';
  };
</script>
`;

/**
 * Open the page in your own Chrome instead of driving one: your profile, your model, a real click.
 * Prints the same report when the page posts its results back, then stops.
 */
async function serveMode() {
  const projectsData = JSON.parse(readFileSync(join(ROOT, 'projects-data.json'), 'utf8'));
  const postsData = JSON.parse(readFileSync(join(ROOT, 'posts-data.json'), 'utf8'));
  const questions = buildQuestions(projectsData, postsData);
  const knownIds = buildEntries(projectsData, postsData).map(entry => entry.id);
  const finished = Promise.withResolvers();
  // Only the page this script printed the address of knows the token, so another tab cannot post results
  const base = `/__eval/${randomUUID()}/`;
  let posted = false;
  const server = await serve((request, response, path) => {
    if (!path.startsWith(base)) return false;
    const route = path.slice(base.length);
    if (route === '') {
      response.writeHead(200, { 'Content-Type': 'text/html' }).end(EVAL_PAGE);
      return true;
    }
    if (route === 'questions.json') {
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify(questions));
      return true;
    }
    if (route === 'result' && request.method === 'POST' && !posted) {
      posted = true;
      let body = '';
      request.on('data', chunk => {
        if (body.length > MAX_BODY_BYTES) return;
        body += chunk;
      });
      request.on('end', () => {
        response.writeHead(204).end();
        try {
          if (body.length > MAX_BODY_BYTES) throw new Error('the results are too large');
          process.exitCode = summarize(readResults(body, questions, knownIds));
        } catch (error) {
          console.error(`eval-ask: could not use the results (${printable(error.message)})`);
          process.exitCode = 2;
        }
        finished.resolve();
      });
      return true;
    }
    return false;
  });
  console.log(
    `Open this in Google Chrome and click Run (Ctrl-C to give up):\n\n  http://localhost:${server.address().port}${base}\n`
  );
  await finished.promise;
  server.close();
}

async function main() {
  if (process.argv.includes('--serve')) return serveMode();
  // Only the launching mode needs it, and loading it is slow
  const { chromium } = await import('@playwright/test');
  const allowDownload = process.argv.includes('--download');
  const profile = option('--profile', join(tmpdir(), 'andernet-eval-ask-profile'));
  const chrome = option('--chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');

  const server = await serve();
  const { port } = server.address();
  // Plain Chrome, attached over the debugging port: Playwright's own launch flags switch the model off
  const process_ = spawn(
    chrome,
    [
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=9334',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=900,700',
      // No window on your desktop (new headless is the real browser, with its GPU and model); --headed to watch
      ...(process.argv.includes('--headed') ? [] : ['--headless=new']),
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  process_.on('exit', (code, signal) => {
    if (!finished)
      console.error(`eval-ask: Chrome exited during the run (code ${code}, signal ${signal})`);
  });
  let browser;
  let finished = false;
  try {
    for (let tries = 0; tries < 40 && !browser; tries++) {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9334');
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!browser) throw new Error('could not attach to Chrome');
    const page = browser.contexts()[0].pages()[0] ?? (await browser.contexts()[0].newPage());
    page.on('crash', () => console.error('eval-ask: the page crashed'));
    page.on('close', () => !finished && console.error('eval-ask: the page was closed'));
    await page.goto(`http://localhost:${port}/robots.txt`);

    const ask = await page.evaluate(async () => {
      const module = await import('/modules/ask.js');
      return { state: await module.askAvailability(), has: typeof globalThis.LanguageModel };
    });
    if (ask.state === 'unavailable') {
      console.error(
        `eval-ask: this Chrome cannot run the model here (LanguageModel is ${ask.has}).`
      );
      process.exitCode = 2;
      return;
    }
    if (ask.state !== 'available' && !allowDownload) {
      console.error(
        `eval-ask: the model is "${ask.state}" in this profile, so running means a download of several gigabytes.\n` +
          `Run again with --download to allow it (profile: ${profile}).`
      );
      process.exitCode = 2;
      return;
    }

    const projectsData = JSON.parse(readFileSync(join(ROOT, 'projects-data.json'), 'utf8'));
    const postsData = JSON.parse(readFileSync(join(ROOT, 'posts-data.json'), 'utf8'));
    const questions = buildQuestions(projectsData, postsData);
    const rows = [];
    for (const question of questions) {
      // A keypress first: the model's first download needs a user gesture
      await page.keyboard.press('Shift');
      const started = Date.now();
      const result = await page.evaluate(
        async ({ text }) => {
          const module = await import('/modules/ask.js');
          const [projects, posts] = await Promise.all([
            fetch('/projects-data.json').then(r => r.json()),
            fetch('/posts-data.json').then(r => r.json()),
          ]);
          return module.askPortfolio({
            question: text,
            entries: module.buildEntries(projects, posts),
            onDownload: fraction => {
              globalThis.__download = fraction;
            },
          });
        },
        { text: question.question }
      );
      rows.push({ question, result, ms: Date.now() - started, ...score(question, result) });
    }

    process.exitCode = summarize(rows);
  } finally {
    finished = true;
    await browser?.close().catch(() => {});
    process_.kill();
    server.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(`eval-ask: ${error.message}`);
    process.exitCode = 2;
  });
}
