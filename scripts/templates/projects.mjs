/**
 * The Selected work section of index.html, pre-rendered by scripts/generate-site.mjs.
 *
 * Three shapes, by how much a project has to show:
 *   lead card   the first project, if it has a screenshot: large
 *   work card   the other featured projects: a screenshot or a generated cover, in a grid
 *   list row    everything else that is starred: name, one line, stack
 *
 * Each links to the project's own page (see project-page.mjs), so there is no script involved
 * in reading a case study. Only stable facts are baked in (see projectView in
 * modules/utils/projects.js); the cards show no live numbers. Every shape carries data-project
 * and data-page, and marks its image and title with data-vt so modules/page-transitions.js can
 * morph them into the page.
 */

import { escapeHtml as esc } from '../../modules/utils/html.js';
import { icon } from '../../modules/utils/icon.js';

const SHOT_SIZES = {
  lead: '(min-width: 64rem) 46rem, 100vw',
  card: '(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw',
  hero: '(min-width: 75rem) 70rem, 100vw',
};

/**
 * One picture of a project for a colour scheme: its screenshot (AVIF with a WebP fallback) or,
 * without one, its generated cover. The light and dark pictures are both in the page and CSS
 * shows one (see .shot in styles/core.css); the hidden one is never fetched because it is lazy
 * and display: none.
 *
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @param {'light' | 'dark'} scheme
 * @param {string} sizes
 * @param {boolean} [eager] - the page's main image: load it at once instead of lazily
 * @returns {string}
 */
function renderPicture(view, scheme, sizes, eager = false) {
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  if (!view.screenshot) {
    // A cover is decoration, not content: it has an empty alt
    return `<img class="shot shot--${scheme}" src="/images/projects/${esc(view.name)}-cover-${scheme}.svg" width="1200" height="750" alt="" ${loading} decoding="async" />`;
  }
  const { name, alt } = view.screenshot;
  const path = width => `/images/projects/${name}-${scheme}-${width}`;
  const set = format => `${path(640)}.${format} 640w, ${path(1200)}.${format} 1200w`;
  return `<picture class="shot shot--${scheme}">
            <source type="image/avif" srcset="${set('avif')}" sizes="${sizes}" />
            <img src="${path(1200)}.webp" srcset="${set('webp')}" sizes="${sizes}" width="1200" height="750" alt="${esc(alt)}" ${loading} decoding="async" />
          </picture>`;
}

/**
 * Both themes' pictures, as they appear in a card or on a page.
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @param {keyof typeof SHOT_SIZES} size
 * @param {boolean} [eager]
 * @returns {string}
 */
export const renderMedia = (view, size, eager = false) =>
  `${renderPicture(view, 'light', SHOT_SIZES[size], eager)}
            ${renderPicture(view, 'dark', SHOT_SIZES[size], eager)}`;

/** Language first, then up to three more, as neutral mono tags. */
const renderTags = view =>
  `<ul class="tag-list">${[view.language, ...view.secondaryTags]
    .map(tag => `<li class="tag">${esc(tag)}</li>`)
    .join('')}</ul>`;

/**
 * The project's title as a link: to its page, in the same tab, or, if it has no write-up, out
 * to its repository.
 */
const renderTitleLink = view =>
  view.pageUrl
    ? `<a href="${esc(view.pageUrl)}">${esc(view.displayName)}</a>`
    : `<a href="${esc(view.htmlUrl)}" target="_blank" rel="noopener noreferrer">${esc(view.displayName)}</a>`;

/** The attributes every shape carries. */
const identify = view => `data-project="${esc(view.slug)}" data-page="${esc(view.pageSlug)}"`;

/**
 * The large card for a project that has a screenshot.
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>} view
 * @returns {string}
 */
export function renderLeadCard(view) {
  const [firstHighlight] = view.highlights;
  const caseStudy = view.pageUrl
    ? `<a class="button button--primary" href="${esc(view.pageUrl)}">Read the case study ${icon('arrow-right')}</a>`
    : '';
  const demo = view.homepage
    ? `<a class="button" href="${esc(view.homepage)}" target="_blank" rel="noopener noreferrer">Live demo ${icon('external-link-alt')}</a>`
    : '';

  return `<article class="lead-card" ${identify(view)}>
          <div class="lead-card__media" data-vt="media">
            ${renderMedia(view, 'lead')}
          </div>
          <div class="lead-card__body">
            ${view.category ? `<p class="eyebrow">${esc(view.category)}</p>` : ''}
            <h3 class="lead-card__title" data-vt="title">${renderTitleLink(view)}</h3>
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
  const caseStudy = view.pageUrl
    ? `<a class="link" href="${esc(view.pageUrl)}">Case study</a>`
    : '';
  const demo = view.homepage
    ? `<a class="link" href="${esc(view.homepage)}" target="_blank" rel="noopener noreferrer">Live demo</a>`
    : '';

  return `<article class="work-card" ${identify(view)}>
          <div class="work-card__media" data-vt="media">
            ${renderMedia(view, 'card')}
          </div>
          <div class="work-card__body">
            ${view.category ? `<p class="eyebrow">${esc(view.category)}</p>` : ''}
            <h3 class="work-card__title" data-vt="title">${renderTitleLink(view)}</h3>
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
  return `<li class="project-list__row" ${identify(view)}>
            <h3 class="project-list__name" data-vt="title">${renderTitleLink(view)}</h3>
            <p class="project-list__desc">${esc(view.description)}</p>
            <p class="project-list__stack">${stack}</p>
          </li>`;
}

/**
 * Sorts the projects into the three shapes.
 *
 * With no featured projects at all (e.g. the curated file is empty) everything is a work card,
 * so the section is never just a list.
 *
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>[]} views
 * @returns {{ lead: object | null, grid: object[], rest: object[] }}
 */
export function splitProjects(views) {
  const lead = views[0]?.screenshot ? views[0] : null;
  const hasFeatured = views.some(view => view.featured);

  const grid = views.filter(view => view !== lead && (view.featured || !hasFeatured));
  const rest = views.filter(view => view !== lead && !grid.includes(view));
  return { lead, grid, rest };
}

/**
 * The cover images that must exist: one per theme for every project that is shown as a card, or
 * has a page of its own, and has no screenshot. The generator writes exactly these, so nothing
 * can point at a cover that wasn't made.
 *
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>[]} cards - the
 *   projects shown in the grid
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>[]} pages - the
 *   projects that have a page
 * @returns {{ file: string, name: string, scheme: 'light' | 'dark' }[]}
 */
export function coverFiles(cards, pages = []) {
  const needing = new Map();
  for (const view of [...cards, ...pages]) {
    if (!view.screenshot) needing.set(view.name, view);
  }
  return [...needing.values()].flatMap(view =>
    ['light', 'dark'].map(scheme => ({
      file: `${view.name}-cover-${scheme}.svg`,
      name: view.name,
      scheme,
    }))
  );
}

/**
 * @param {ReturnType<typeof import('../../modules/utils/projects.js').projectView>[]} views
 * @returns {{ lead: string, cards: string, more: string, counts: { lead: number, cards: number, more: number } }}
 */
export function renderProjects(views) {
  const { lead, grid, rest } = splitProjects(views);

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
