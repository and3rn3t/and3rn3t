/**
 * The Selected work section of index.html, pre-rendered by scripts/generate-site.mjs.
 *
 * Three shapes, by how much a project has to show:
 *   lead card   the first project, if it has a screenshot: large
 *   work card   the other featured projects: a screenshot or a generated cover, in a grid
 *   list row    everything else that is starred: name, one line, stack
 *
 * Only stable facts are baked in (see projectView in modules/utils/projects.js). Live numbers
 * (stars, last push) are not shown on these cards at all; modules/projects.js only registers
 * each project's case study with the modal and enables its button. Every shape carries
 * data-project, and a case-study button is data-pending (hidden, but keeping its space) until
 * then; without JS it stays hidden, since it would have nothing to open.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';

const SHOT_SIZES = {
  lead: '(min-width: 64rem) 46rem, 100vw',
  card: '(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw',
};

/**
 * One picture of a project for a colour scheme: its screenshot (AVIF with a WebP fallback) or,
 * without one, its generated cover. The light and dark pictures are both in the page and CSS
 * shows one (see .shot in styles/home.css); the hidden one is never fetched because it is lazy
 * and display: none.
 *
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @param {'light' | 'dark'} scheme
 * @param {string} sizes
 * @returns {string}
 */
function renderPicture(view, scheme, sizes) {
  if (!view.screenshot) {
    // A cover is decoration, not content: it has an empty alt
    return `<img class="shot shot--${scheme}" src="/images/projects/${esc(view.name)}-cover-${scheme}.svg" width="1200" height="750" alt="" loading="lazy" decoding="async" />`;
  }
  const { name, alt } = view.screenshot;
  const path = width => `/images/projects/${name}-${scheme}-${width}`;
  const set = format => `${path(640)}.${format} 640w, ${path(1200)}.${format} 1200w`;
  return `<picture class="shot shot--${scheme}">
            <source type="image/avif" srcset="${set('avif')}" sizes="${sizes}" />
            <img src="${path(1200)}.webp" srcset="${set('webp')}" sizes="${sizes}" width="1200" height="750" alt="${esc(alt)}" loading="lazy" decoding="async" />
          </picture>`;
}

const renderMedia = (view, sizes) =>
  `${renderPicture(view, 'light', sizes)}
            ${renderPicture(view, 'dark', sizes)}`;

/** Language first, then up to three more, as neutral mono tags. */
const renderTags = view =>
  `<ul class="tag-list">${[view.language, ...view.secondaryTags]
    .map(tag => `<li class="tag">${esc(tag)}</li>`)
    .join('')}</ul>`;

/** A case-study opener. It looks like a link and stays out of sight until it can work. */
const renderCaseStudy = (view, className, label) =>
  view.hasCaseStudy
    ? `<button type="button" class="${className}" data-case-study="${esc(view.slug)}" data-pending>${label}</button>`
    : '';

/**
 * The large card for a project that has a screenshot.
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @returns {string}
 */
export function renderLeadCard(view) {
  const [firstHighlight] = view.highlights;
  const caseStudy = renderCaseStudy(
    view,
    'button button--primary',
    `Read the case study ${icon('arrow-right')}`
  );
  const demo = view.homepage
    ? `<a class="button" href="${esc(view.homepage)}" target="_blank" rel="noopener noreferrer">Live demo ${icon('external-link-alt')}</a>`
    : '';

  return `<article class="lead-card" data-project="${esc(view.slug)}">
          <div class="lead-card__media">
            ${renderMedia(view, SHOT_SIZES.lead)}
          </div>
          <div class="lead-card__body">
            ${view.category ? `<p class="eyebrow">${esc(view.category)}</p>` : ''}
            <h3 class="lead-card__title"><a href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">${esc(view.displayName)}</a></h3>
            <p class="lead-card__desc">${esc(view.description)}</p>
            ${firstHighlight ? `<p class="lead-card__lead">→ ${esc(firstHighlight)}</p>` : ''}
            ${renderTags(view)}
            <div class="lead-card__actions">
              ${caseStudy}
              ${demo}
              <a class="link" href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">Source</a>
            </div>
          </div>
        </article>`;
}

/**
 * A grid card: an image, what it is, what it is built with, and where to go next.
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @returns {string}
 */
export function renderWorkCard(view) {
  const caseStudy = renderCaseStudy(view, 'link', 'Case study');
  const demo = view.homepage
    ? `<a class="link" href="${esc(view.homepage)}" target="_blank" rel="noopener noreferrer">Live demo</a>`
    : '';

  return `<article class="work-card" data-project="${esc(view.slug)}">
          <div class="work-card__media">
            ${renderMedia(view, SHOT_SIZES.card)}
          </div>
          <div class="work-card__body">
            ${view.category ? `<p class="eyebrow">${esc(view.category)}</p>` : ''}
            <h3 class="work-card__title"><a href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">${esc(view.displayName)}</a></h3>
            <p class="work-card__desc">${esc(view.description)}</p>
            ${renderTags(view)}
            <div class="work-card__actions">
              ${caseStudy}
              ${demo}
              <a class="link" href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">Source</a>
            </div>
          </div>
        </article>`;
}

/**
 * A row of the compact list: for projects worth a line, not a card.
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @returns {string}
 */
export function renderListRow(view) {
  const stack = [view.language, ...view.secondaryTags.slice(0, 2)].map(esc).join(' · ');
  return `<li class="project-list__row" data-project="${esc(view.slug)}">
            <h3 class="project-list__name"><a href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">${esc(view.displayName)}</a></h3>
            <p class="project-list__desc">${esc(view.description)}</p>
            <p class="project-list__stack">${stack}</p>
            ${renderCaseStudy(view, 'link project-list__case-study', 'Case study')}
          </li>`;
}

/**
 * Sorts the projects into the three shapes.
 *
 * With no featured projects at all (e.g. the curated file is empty) everything is a work card,
 * so the section is never just a list.
 *
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>[]} views
 * @returns {{ lead: string, cards: string, more: string, counts: { lead: number, cards: number, more: number } }}
 */
export function renderProjects(views) {
  const lead = views[0]?.screenshot ? views[0] : null;
  const hasFeatured = views.some(view => view.featured);

  const grid = views.filter(view => view !== lead && (view.featured || !hasFeatured));
  const rest = views.filter(view => view !== lead && !grid.includes(view));

  return {
    lead: lead ? renderLeadCard(lead) : '',
    cards: grid.map(renderWorkCard).join('\n        '),
    more: rest.length
      ? `<p class="eyebrow">More</p>
        <ul class="project-list">
          ${rest.map(renderListRow).join('\n          ')}
        </ul>`
      : '',
    counts: { lead: lead ? 1 : 0, cards: grid.length, more: rest.length },
  };
}
