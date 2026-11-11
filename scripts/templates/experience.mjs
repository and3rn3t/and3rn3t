/**
 * The Experience section of index.html and the About "at a glance" facts, pre-rendered by
 * scripts/generate-site.mjs from experience-data.json.
 *
 * A job is one block: role, company and dates on a row, a summary, and the highlights and
 * technologies in a <details> (open for the current role). That is native HTML, so it works
 * without JavaScript. Education is a compact list of rows.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Jun 2021 – Present" from "2021-06" style dates.
 * @param {string | undefined} startDate
 * @param {string | undefined} endDate
 * @param {boolean} current
 * @returns {string}
 */
export function formatDateRange(startDate, endDate, current) {
  const format = date => {
    if (!date) return '';
    const [year, month] = date.split('-');
    return month ? `${MONTHS[Number(month) - 1]} ${year}` : year;
  };
  const start = format(startDate);
  const end = current ? 'Present' : format(endDate);
  return start ? `${start} – ${end}` : end;
}

/** A link to the organisation when we have its URL, otherwise just its name. */
const renderOrganisation = (name, url, className) =>
  url
    ? `<a class="${className}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(name)}</a>`
    : `<span class="${className}">${esc(name)}</span>`;

/**
 * @param {object} job
 * @returns {string}
 */
function renderJob(job) {
  const dates = formatDateRange(job.startDate, job.endDate, Boolean(job.current));
  const highlights = job.highlights ?? [];
  const technologies = job.technologies ?? [];

  const more =
    highlights.length || technologies.length
      ? `
          <details class="job__more"${job.current ? ' open' : ''}>
            <summary class="job__toggle">Highlights${highlights.length ? ` <span class="job__count">${highlights.length}</span>` : ''}</summary>
            ${highlights.length ? `<ul class="job__highlights">${highlights.map(text => `<li>${esc(text)}</li>`).join('')}</ul>` : ''}
            ${technologies.length ? `<ul class="tag-list">${technologies.map(tag => `<li class="tag">${esc(tag)}</li>`).join('')}</ul>` : ''}
          </details>`
      : '';

  return `<article class="job${job.current ? ' job--current' : ''}">
          <header class="job__head">
            <h3 class="job__role">${esc(job.role)}</h3>
            <p class="job__company">${renderOrganisation(job.company, job.companyUrl, 'job__company-link')}</p>
            <p class="job__dates">${esc(dates)}${job.current ? ' <span class="job__now">Current</span>' : ''}</p>
          </header>
          ${job.summary ? `<p class="job__summary">${esc(job.summary)}</p>` : ''}${more}
        </article>`;
}

/**
 * @param {object[] | undefined} jobs
 * @returns {string}
 */
export function renderJobs(jobs) {
  return (jobs ?? []).map(renderJob).join('\n        ');
}

/**
 * Education as compact rows: what, where, when, and a note if there is one.
 * @param {object[] | undefined} entries
 * @returns {string}
 */
export function renderEducation(entries) {
  const rows = (entries ?? []).map(entry => {
    const dates = formatDateRange(entry.startDate, entry.endDate, false);
    const [note] = entry.highlights ?? [];
    return `<li class="edu-row">
            <h4 class="edu-row__degree">${esc(entry.degree)}</h4>
            <p class="edu-row__school">${renderOrganisation(entry.institution, entry.institutionUrl, 'edu-row__school-link')}</p>
            <p class="edu-row__dates">${esc(dates)}</p>
            ${note ? `<p class="edu-row__note">${esc(note)}</p>` : ''}
          </li>`;
  });
  return `<ul class="edu-list">
          ${rows.join('\n          ')}
        </ul>`;
}

/**
 * The About "at a glance" facts, from the current role: what, where, since when.
 * @param {object[] | undefined} jobs
 * @returns {string} empty if no role is marked current
 */
export function renderFacts(jobs) {
  const current = (jobs ?? []).find(job => job.current);
  if (!current) return '';
  const since = current.startDate?.split('-')[0];
  return `<dl class="facts">
            <div class="facts__row"><dt>Role</dt><dd>${esc(current.role)}</dd></div>
            <div class="facts__row"><dt>At</dt><dd>${renderOrganisation(current.company, current.companyUrl, 'link')}</dd></div>
            ${since ? `<div class="facts__row"><dt>Since</dt><dd>${esc(since)}</dd></div>` : ''}
          </dl>`;
}
