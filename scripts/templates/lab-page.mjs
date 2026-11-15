/**
 * The lab page, /lab/: the site's opt-in experiments, each off by default. This file renders the
 * list from lab-data.json (what an experiment is, what it needs from the browser, what was
 * measured). modules/lab-page.js adds the switches and says whether this browser can run each one.
 * Without JavaScript every row is a plain link that turns the experiment on for one visit.
 */

import { escapeHtml } from '../../modules/utils/html.js';
import { PAGE_SCRIPTS, renderFooter, renderHead, renderNav } from './chrome.mjs';

const esc = escapeHtml;

const STATUS_LABEL = { spike: 'Spike', kept: 'In the lab', dropped: 'Dropped' };

/**
 * @param {{ flag: string, title: string, status: keyof typeof STATUS_LABEL, summary: string,
 *   needs: string, measure: string, try?: string }} experiment
 * @returns {string}
 */
function renderExperiment(experiment) {
  const link = experiment.try ?? `/?lab=${experiment.flag}`;
  const live = experiment.status !== 'dropped';
  return `<li class="lab-item" data-lab-item="${esc(experiment.flag)}" data-needs="${esc(experiment.needs)}">
            <div class="lab-item__head">
              <h2 class="lab-item__title">${esc(experiment.title)}</h2>
              <span class="lab-item__status" data-status="${esc(experiment.status)}">${STATUS_LABEL[experiment.status]}</span>
            </div>
            <p class="lab-item__summary">${esc(experiment.summary)}</p>
            <dl class="lab-item__facts">
              <div><dt>Needs</dt><dd>${esc(experiment.needs)} <span data-lab-support></span></dd></div>
              <div><dt>Measured</dt><dd>${esc(experiment.measure)}</dd></div>
            </dl>
            ${
              live
                ? `<p class="lab-item__actions">
              <label class="lab-switch" hidden data-lab-switch>
                <input type="checkbox" data-lab-toggle="${esc(experiment.flag)}" />
                <span>Keep on for this browser</span>
              </label>
              <a class="link" href="${esc(link)}">Try it once</a>
            </p>`
                : ''
            }
          </li>`;
}

/**
 * @param {object[]} experiments
 * @returns {string} a complete HTML document
 */
export function renderLabPage(experiments) {
  return `<!doctype html>
<html lang="en">
  ${renderHead({
    title: 'Lab | Matthew Anderson',
    description:
      'Experiments on andernet.dev that are off unless you ask for them: what each one is, what it needs from your browser, and what was measured.',
    path: '/lab/',
    stylesheets: ['/styles/lab.css'],
  })}
  <body>
    <a href="#main" class="skip-link">Skip to main content</a>
    ${renderNav({ backHref: '/', backLabel: 'Home' })}
    <main id="main" class="article lab" data-lab-root>
      <div class="wrap">
        <header class="lab-head">
          <p class="eyebrow">Lab</p>
          <h1 class="lab-title">Things to try</h1>
          <p class="lab-lede">
            Experiments that are off unless you ask for them. The ordinary page never loads one, and a
            switch here is saved only in this browser: nothing is sent anywhere. Each entry says what
            it needs from the browser and what was measured, including the ones that were dropped.
          </p>
        </header>
        <ul class="lab-list">
          ${experiments.map(renderExperiment).join('\n          ')}
        </ul>
      </div>
    </main>
    ${renderFooter()}
    ${PAGE_SCRIPTS}
    <script type="module" src="/modules/lab-page.js"></script>
  </body>
</html>
`;
}
