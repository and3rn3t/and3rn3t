/**
 * Work and education timelines for index.html, pre-rendered by scripts/generate-site.mjs
 * from experience-data.json.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';

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

/**
 * @param {object} entry - a job (type "work") or a school (type "edu")
 * @param {'work' | 'edu'} type
 * @returns {string}
 */
function renderEntry(entry, type) {
  const isWork = type === 'work';
  const dateRange = formatDateRange(entry.startDate, entry.endDate, isWork && entry.current);
  const name = isWork ? entry.company : entry.institution;
  const nameUrl = isWork ? entry.companyUrl : entry.institutionUrl;
  const title = isWork ? entry.role : entry.degree;

  const nameHtml = nameUrl
    ? `<a href="${esc(nameUrl)}" target="_blank" rel="noopener noreferrer" class="timeline-company-link">${esc(name)}</a>`
    : esc(name);
  const location = entry.location
    ? `<span class="timeline-location">${icon('map-marker-alt')} ${esc(entry.location)}</span>`
    : '';
  const highlights = entry.highlights?.length
    ? `<ul class="timeline-highlights">${entry.highlights.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`
    : '';
  const tech = entry.technologies?.length
    ? `<div class="timeline-tech">${entry.technologies.map(text => `<span class="timeline-tech-tag">${esc(text)}</span>`).join('')}</div>`
    : '';
  const summary = entry.summary ? `<p class="timeline-summary">${esc(entry.summary)}</p>` : '';
  const currentBadge = entry.current ? '<span class="timeline-current-badge">Current</span>' : '';

  return `<article class="timeline-item${entry.current ? ' timeline-item--current' : ''}">
          <div class="timeline-dot" aria-hidden="true"></div>
          <div class="timeline-content">
            <header class="timeline-header">
              <div class="timeline-title-row">
                <h3 class="timeline-role">${esc(title)}</h3>
                ${currentBadge}
              </div>
              <div class="timeline-meta">
                <span class="timeline-company">${nameHtml}</span>
                ${location}
                <span class="timeline-dates">${icon('calendar-alt')} ${esc(dateRange)}</span>
              </div>
            </header>
            ${summary}
            ${highlights}
            ${tech}
          </div>
        </article>`;
}

/**
 * @param {object[]} entries
 * @param {'work' | 'edu'} type
 * @returns {string}
 */
export function renderTimeline(entries, type) {
  return (entries ?? []).map(entry => renderEntry(entry, type)).join('\n        ');
}
