#!/usr/bin/env node
/**
 * Check the site's own words against the copy rules.
 *
 * One rule so far: copy about Matt uses no gendered pronouns, because they are not stated anywhere.
 * Say "Matthew", "Matt" or the name of the thing, or rewrite the sentence.
 *
 * It reads the sources, not the generated pages (those come from the data files and templates).
 * Findings are listed with file and line so a person decides: a pronoun about someone else is fine.
 *
 * Usage: node scripts/check-copy.mjs          exits 1 when there are findings
 *        node scripts/check-copy.mjs --report  same output, always exits 0 (for CI reports)
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Files whose words visitors, crawlers or agents read. */
export const SOURCES = [
  'posts-data.json',
  'projects-data.json',
  'experience-data.json',
  'worker/mcp.js',
  'worker/mcp/profile.js',
  'worker/mcp/projects.js',
  'worker/mcp/posts.js',
  'worker/mcp/site-health.js',
  'worker/mcp/prompts-resources.js',
  'worker/mcp/shared.js',
  'worker/mcp-content.js',
  'worker/discovery.js',
  'llms.txt',
];

const PRONOUNS = /\b(he|him|his|himself|she|her|hers|herself)\b/gi;

/** @type {Array<{ id: string, test: (line: string) => string[] }>} */
export const RULES = [
  {
    id: 'no-pronouns-for-matt',
    test: line => [...line.matchAll(PRONOUNS)].map(match => match[0]),
  },
];

/**
 * @param {string} file
 * @param {string} text
 * @returns {Array<{ file: string, line: number, rule: string, found: string[], text: string }>}
 */
export function findIssues(file, text) {
  return text.split('\n').flatMap((lineText, index) =>
    RULES.flatMap(rule => {
      const found = rule.test(lineText);
      return found.length === 0
        ? []
        : [{ file, line: index + 1, rule: rule.id, found, text: lineText.trim().slice(0, 140) }];
    })
  );
}

function main() {
  const report = process.argv.includes('--report');
  const issues = SOURCES.flatMap(file => findIssues(file, readFileSync(file, 'utf8')));
  for (const { file, line, rule, found, text } of issues) {
    console.log(`${file}:${line} [${rule}] ${found.join(', ')}\n    ${text}`);
  }
  console.log(`\n${issues.length} finding(s) in ${SOURCES.length} files.`);
  if (issues.length > 0 && !report) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
