/**
 * Project cards for index.html, pre-rendered by scripts/generate-site.mjs.
 *
 * Only stable facts are baked in (see projectView in modules/utils/projects.js). The live
 * parts are empty slots that modules/projects.js fills in the browser:
 *   [data-live="stars"]        star count
 *   [data-live-stat="pushed"]  "last pushed" stat, hidden until there is a value (always
 *                              present: a repo can show up in the data after the page was built)
 *   [data-pending]             case-study button, enabled once its study is registered
 *   .project-card--recent      "Active" badge for repos pushed to in the last 180 days
 *   [data-status-active]       the status badge that "Active" makes redundant
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';
import { languageColor } from '../../modules/utils/projects.js';

/**
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @param {{ extra?: boolean }} [options] - extra cards start hidden behind "Show more"
 * @returns {string}
 */
export function renderProjectCard(view, { extra = false } = {}) {
  const color = languageColor(view.language);
  const attributes = [
    'class="project-card"',
    `data-project="${esc(view.slug)}"`,
    color ? `style="--lang-color: ${color}"` : '',
    extra ? 'data-extra hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // data-pending keeps the button's space but hides and disables it: it has no action
  // without JS, and a click before modules/projects.js registers the study would be lost.
  const caseStudy = view.hasCaseStudy
    ? `
                <button type="button" class="project-case-study-btn" data-case-study="${esc(view.slug)}" data-pending>
                    ${icon('book-open')}
                    Read case study
                </button>`
    : '';

  const [firstHighlight] = view.highlights;
  const statusClass = view.status ? view.status.toLowerCase().replaceAll(/\s+/g, '-') : '';
  const statusBadge = view.status
    ? `<span class="status-badge ${esc(statusClass)}"${/^active\b/i.test(view.status) ? ' data-status-active' : ''}>${esc(view.status)}</span>`
    : '';

  const docsOrDemo = view.homepage
    ? `<a href="${esc(view.homepage)}" target="_blank" rel="noopener noreferrer" class="project-link live">
                        ${icon('external-link-alt')}
                        Live Demo
                    </a>`
    : `<a href="${esc(view.htmlUrl)}/blob/main/README.md" target="_blank" rel="noopener noreferrer" class="project-link secondary">
                        ${icon('file-alt')}
                        Documentation
                    </a>`;

  return `<div ${attributes}>
            <div class="project-header">
                <div class="project-card-badges">
                    ${view.category ? `<span class="project-category">${esc(view.category)}</span>` : ''}
                </div>
                <h3 class="project-title"><a href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">${esc(view.displayName)}</a></h3>
                <p class="project-description">${esc(view.description)}</p>
                ${firstHighlight ? `<p class="project-highlight-lead">→ ${esc(firstHighlight)}</p>` : ''}${caseStudy}

                <div class="project-stats">
                    <div class="project-stat" title="Stars">
                        ${icon('star')}
                        <span data-live="stars">—</span>
                    </div>
                    <div class="project-stat" title="Last pushed" data-live-stat="pushed" hidden>
                        ${icon('code-commit')}
                        <span data-live="pushed"></span>
                    </div>
                </div>

                <div class="project-languages">
                    <span class="language-tag primary">${esc(view.language)}</span>
                    ${view.secondaryTags.map(tag => `<span class="language-tag">${esc(tag)}</span>`).join('')}
                    ${statusBadge}
                </div>
            </div>

            <div class="project-links">
                <a href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer" class="project-link">
                    ${icon('github')}
                    View Code
                </a>
                ${docsOrDemo}
            </div>
        </div>`;
}

/**
 * The grid's cards and the "Show more" button.
 *
 * Featured projects show; the rest wait behind the button. With no featured flags at all
 * (e.g. the curated file is empty) everything shows.
 *
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>[]} views
 * @returns {{ cards: string, moreButton: string, extraCount: number }}
 */
export function renderProjects(views) {
  const hideRest = views.some(view => view.featured);
  const extraCount = hideRest ? views.filter(view => !view.featured).length : 0;

  const cards = views
    .map(view => renderProjectCard(view, { extra: hideRest && !view.featured }))
    .join('\n        ');

  const label =
    extraCount > 0
      ? `Show ${extraCount} more project${extraCount === 1 ? '' : 's'}`
      : 'Show more projects';
  const moreButton = `<button
              type="button"
              class="btn btn-outline projects-more-btn"
              id="projects-more-btn"
              aria-expanded="false"
              aria-controls="projects-grid"${extraCount > 0 ? '' : '\n              hidden'}
            >
              ${label}
            </button>`;

  return { cards, moreButton, extraCount };
}
