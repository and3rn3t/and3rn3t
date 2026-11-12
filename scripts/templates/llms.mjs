/**
 * llms.txt: a plain-text guide to the site for language models and agents (https://llmstxt.org).
 * An H1, a one-paragraph summary, then lists of links with a line about each. Written from the
 * same data as the pages, so it can't drift from them.
 */

import { AUTHOR, SITE } from './chrome.mjs';

/** One line of Markdown text: no line breaks, and no brackets that would end a link label. */
const line = text => String(text).replaceAll(/\s+/g, ' ').trim();
const label = text => line(text).replaceAll('[', '(').replaceAll(']', ')');

const years = ({ startDate, endDate, current }) => {
  if (current) return `${startDate} to present`;
  if (!startDate || startDate === endDate) return endDate;
  return `${startDate} to ${endDate}`;
};

/**
 * @param {object} args
 * @param {object[]} args.projects - project views that have a page, in display order
 * @param {object[]} args.posts - newest first
 * @param {object[]} args.experience - experience-data.json's `experience`
 * @param {object[]} args.education - experience-data.json's `education`
 * @returns {string} the file's contents
 */
export function renderLlmsTxt({ projects, posts, experience, education }) {
  const now = experience.find(job => job.current);
  const role = now ? `${now.role} at ${now.company}. ` : '';

  const projectLines = projects.map(
    view => `- [${label(view.displayName)}](${SITE}${view.pageUrl}): ${line(view.description)}`
  );
  const postLines = posts.map(
    post =>
      `- [${label(post.title)}](${SITE}/posts/${post.slug}/): ${line(post.summary)} (${post.date})`
  );
  const jobLines = experience.map(
    job => `- ${line(job.role)}, ${line(job.company)}, ${years(job)}`
  );
  const schoolLines = education.map(
    school => `- ${line(school.degree)}, ${line(school.institution)}, ${years(school)}`
  );

  return `# ${AUTHOR}

> ${role}Side projects in health tech, home automation and data tools. This site is the portfolio: a write-up of each project, a few technical posts, and a work history.

Every page on this site is also available as Markdown: request it with \`Accept: text/markdown\`.

Work history:

${jobLines.join('\n')}

Education:

${schoolLines.join('\n')}

## Projects

${projectLines.join('\n')}

## Writing

${postLines.join('\n')}

## Contact

- [Email](mailto:and3rn3t@icloud.com): the most direct way to get in touch
- [GitHub](https://github.com/and3rn3t): source for every project here
- [LinkedIn](https://linkedin.com/in/and3rn3t)

## Optional

- [Home page](${SITE}/): the same content, laid out for people
- [RSS feed](${SITE}/feed.xml): the posts, in full
- [Sitemap](${SITE}/sitemap.xml)
- [Résumé](${SITE}/resume.pdf): PDF
`;
}
