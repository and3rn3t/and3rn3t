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
 * Usage: pnpm eval:ask [--download] [--profile <dir>] [--chrome <path>]
 * Exit: 0 ran; 1 the model named a page that is not on the site; 2 it could not run (say why).
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

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
  // The start of a project's description, without its name
  for (const project of projects.filter(item => item.description).slice(3, 6)) {
    const words = project.description.split(/\s+/).slice(0, 8).join(' ');
    questions.push({
      id: `description:${project.name}`,
      question: `Which project is this: ${words}`,
      expect: [`project:${project.name}`],
    });
  }
  // Nothing on the site answers this: the right answer is no page
  questions.push({
    id: 'none:weather',
    question: 'What is the weather in Paris tomorrow?',
    expect: [],
    none: true,
  });
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

/** The repo's files over http on localhost, so the page is a secure context with the real modules. */
function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (path.includes('..')) return response.writeHead(403).end();
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

async function main() {
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
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let browser;
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
    let invalid = 0;
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
      invalid += result.invalid ?? 0;
      rows.push({ question, result, ms: Date.now() - started, ...score(question, result) });
      const mark = rows.at(-1).anywhere ? (rows.at(-1).top1 ? 'top' : 'in ') : 'MISS';
      console.log(
        `${mark}  ${String(rows.at(-1).ms).padStart(5)} ms  ${question.id.padEnd(34)} -> ${(result.ids ?? [result.status]).join(', ') || '(none)'}`
      );
    }

    const asked = rows.filter(row => !row.question.none);
    const rate = (rowsIn, key) => `${rowsIn.filter(row => row[key]).length}/${rowsIn.length}`;
    console.log(
      `\nright page first: ${rate(asked, 'top1')}   right page among the picks: ${rate(asked, 'anywhere')}` +
        `   declines what the site cannot answer: ${rate(
          rows.filter(row => row.question.none),
          'top1'
        )}` +
        `   page ids not on the site: ${invalid}   median ${[...rows].sort((a, b) => a.ms - b.ms)[Math.floor(rows.length / 2)].ms} ms`
    );
    process.exitCode = invalid > 0 ? 1 : 0;
  } finally {
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
