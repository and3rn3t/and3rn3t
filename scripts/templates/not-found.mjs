/**
 * The 404 page, /404.html. GitHub Pages serves it at the address that was not found, which can
 * be any depth, so every URL on it is absolute (the shared head and nav already are).
 */

import { icon } from '../../modules/utils/icon.js';
import { PAGE_SCRIPTS, renderFooter, renderHead, renderNav } from './chrome.mjs';

/** @returns {string} a complete HTML document */
export function renderNotFoundPage() {
  return `<!doctype html>
<html lang="en">
  ${renderHead({
    title: 'Page not found | Matthew Anderson',
    description:
      'That page does not exist. Head back to the projects, writing or contact sections.',
    path: null,
    robots: 'noindex',
  })}
  <body>
    <a href="#main" class="skip-link">Skip to main content</a>
    ${renderNav({ backHref: '/', backLabel: 'Home' })}
    <main id="main" class="article">
      <div class="wrap">
        <section class="not-found" aria-labelledby="not-found-title">
          <p class="not-found__code" aria-hidden="true">404</p>
          <p class="eyebrow">Page not found</p>
          <h1 class="not-found__title" id="not-found-title">There is nothing at this address.</h1>
          <p class="not-found__lede">
            The page may have moved, or the link may be mistyped. These are the places that do exist.
          </p>
          <div class="not-found__actions">
            <a class="button button--primary" href="/">${icon('arrow-left')} Back to the home page</a>
          </div>
          <ul class="not-found__links">
            <li><a class="link" href="/#projects">Selected work</a></li>
            <li><a class="link" href="/#writing">Writing</a></li>
            <li><a class="link" href="/#contact">Contact</a></li>
          </ul>
        </section>
      </div>
    </main>
    ${renderFooter()}
    ${PAGE_SCRIPTS}
  </body>
</html>
`;
}
