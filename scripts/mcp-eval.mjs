#!/usr/bin/env node
/**
 * Ask Claude portfolio questions through the live /mcp server and check the answers.
 *
 * It answers one question: can an assistant that only has the MCP tools get the facts right?
 * The expected answers are read from the data files the site publishes, so the cases never go
 * stale when content changes. Grading is plain string matching, not a second model, so a
 * failure is something you can read and reproduce.
 *
 * Report only: it never exits non-zero for a wrong answer. Each question is a real Claude
 * Code run, so it costs usage; the default is a dry run that prints the cases and spends nothing.
 *
 * Usage:
 *   node scripts/mcp-eval.mjs [url]          dry run: print the cases
 *   node scripts/mcp-eval.mjs [url] --run    ask Claude each one (needs the `claude` CLI and a login or
 *                                            CLAUDE_CODE_OAUTH_TOKEN); also writes $GITHUB_STEP_SUMMARY
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL = 'https://andernet.dev';
const MODEL = 'claude-haiku-5-5';
const SERVER = 'portfolio';

/**
 * @typedef {{
 *   id: string,
 *   question: string,
 *   expectAll: string[],
 *   expectAny?: string[],
 *   tools: string[],
 * }} Case
 */

/**
 * @param {{ projects: Array<{ name: string, displayName?: string, technologies?: string[] }> }} projectsData
 * @param {{ posts: Array<{ title: string, date: string }> }} postsData
 * @param {{ experience: Array<{ company: string, current?: boolean }> }} experienceData
 * @returns {Case[]}
 */
export function buildCases(projectsData, postsData, experienceData) {
  const cases = [];

  const current =
    experienceData.experience.find(job => job.current) ?? experienceData.experience[0];
  if (current) {
    cases.push({
      id: 'current-employer',
      question: 'Where does Matthew Anderson work right now? Answer in one sentence.',
      expectAll: [current.company.split(/[ ,&]/)[0]],
      tools: ['get_profile', 'list_experience'],
    });
  }

  const newest = [...postsData.posts].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (newest) {
    cases.push({
      id: 'newest-post',
      question: 'What is the title of the newest post on his site? Answer with the title only.',
      expectAll: [newest.title],
      tools: ['list_posts'],
    });
  }

  cases.push({
    id: 'post-count',
    question: 'How many posts are on his site? Answer with a number only.',
    expectAll: [String(postsData.posts.length)],
    tools: ['list_posts'],
  });

  const withTech = projectsData.projects.find(project => (project.technologies ?? []).length >= 2);
  if (withTech) {
    cases.push({
      id: 'project-technologies',
      question: `Which technologies does the project "${withTech.name}" use? List them.`,
      expectAll: (withTech.technologies ?? []).slice(0, 2),
      tools: ['get_project', 'list_projects'],
    });
  }

  cases.push({
    id: 'unknown-project',
    question: 'Describe his project called "zzz-not-a-project". If there is none, say so.',
    expectAll: [],
    expectAny: [
      'no project',
      'not a project',
      "isn't",
      'is not',
      'not found',
      "couldn't find",
      'no such',
    ],
    tools: ['get_project', 'list_projects'],
  });

  return cases;
}

/**
 * @param {Case} testCase
 * @param {{ answer: string, toolsCalled: string[] }} run
 * @returns {{ pass: boolean, problems: string[] }}
 */
export function grade(testCase, run) {
  const answer = run.answer.toLowerCase();
  const problems = [];

  for (const wanted of testCase.expectAll) {
    if (!answer.includes(wanted.toLowerCase())) problems.push(`answer is missing "${wanted}"`);
  }
  if (
    testCase.expectAny &&
    !testCase.expectAny.some(phrase => answer.includes(phrase.toLowerCase()))
  ) {
    problems.push(`answer says none of: ${testCase.expectAny.join(' | ')}`);
  }
  if (!run.toolsCalled.some(tool => testCase.tools.includes(tool))) {
    problems.push(
      `did not call any of: ${testCase.tools.join(', ')} (called: ${run.toolsCalled.join(', ') || 'nothing'})`
    );
  }
  return { pass: problems.length === 0, problems };
}

/**
 * Read the answer and the portfolio tools used from `claude --output-format stream-json`.
 * @param {string} stdout
 * @returns {{ answer: string, toolsCalled: string[] }}
 */
export function parseStream(stdout) {
  const toolsCalled = [];
  let answer = '';
  const prefix = `mcp__${SERVER}__`;
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') {
      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_use' && block.name?.startsWith(prefix)) {
          toolsCalled.push(block.name.slice(prefix.length));
        }
      }
    }
    if (event.type === 'result' && typeof event.result === 'string') answer = event.result;
  }
  return { answer, toolsCalled };
}

/** Text safe inside one markdown table cell: one line, backslashes escaped first, then pipes. */
export function tableCell(text) {
  return text.replace(/\s+/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

/**
 * @param {Array<{ testCase: Case, answer: string, toolsCalled: string[], pass: boolean, problems: string[] }>} results
 * @returns {string} markdown
 */
export function formatReport(results) {
  const passed = results.filter(result => result.pass).length;
  const rows = results.map(({ testCase, pass, problems, toolsCalled, answer }) => {
    const note = pass ? '' : tableCell(problems.join('; '));
    const shortAnswer = tableCell(answer.slice(0, 120));
    return `| ${pass ? '✅' : '❌'} | ${testCase.id} | ${toolsCalled.join(', ') || '-'} | ${shortAnswer} | ${note} |`;
  });
  return [
    `## MCP eval: ${passed}/${results.length} passed`,
    '',
    `Model \`${MODEL}\`, tools from the live \`/mcp\` only. Report only, nothing here fails the build.`,
    '',
    '| | Case | Tools called | Answer (start) | Problems |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** Ask Claude one question with only the portfolio server's tools. */
function askClaude(question, mcpUrl) {
  const config = JSON.stringify({ mcpServers: { [SERVER]: { type: 'http', url: mcpUrl } } });
  const result = spawnSync(
    'claude',
    [
      '-p',
      question,
      '--model',
      MODEL,
      '--mcp-config',
      config,
      '--strict-mcp-config',
      '--allowedTools',
      `mcp__${SERVER}`,
      '--tools',
      '',
      '--max-turns',
      '6',
      '--output-format',
      'stream-json',
      '--verbose',
    ],
    { encoding: 'utf8', timeout: 180_000 }
  );
  if (result.error) throw result.error;
  return parseStream(result.stdout);
}

async function loadJson(base, path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  const base = (args.find(arg => !arg.startsWith('--')) ?? DEFAULT_URL).replace(/\/$/, '');
  const shouldRun = args.includes('--run');

  const [projects, posts, experience] = await Promise.all([
    loadJson(base, '/projects-data.json'),
    loadJson(base, '/posts-data.json'),
    loadJson(base, '/experience-data.json'),
  ]);
  const cases = buildCases(projects, posts, experience);

  if (!shouldRun) {
    for (const testCase of cases) {
      console.log(
        `${testCase.id}: ${testCase.question}\n  expects ${JSON.stringify(testCase.expectAll)} via ${testCase.tools.join(' | ')}`
      );
    }
    console.log(`\nDry run: ${cases.length} cases, nothing asked. Add --run to ask Claude.`);
    return;
  }

  const results = cases.map(testCase => {
    const run = askClaude(testCase.question, `${base}/mcp`);
    return { testCase, ...run, ...grade(testCase, run) };
  });
  const report = formatReport(results);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
