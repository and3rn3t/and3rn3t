# Copilot instructions

Read [`AGENTS.md`](../AGENTS.md) first: stack, commands and conventions live there. This file only
lists what review and completion tools most often get wrong.

- **No bundler in production.** GitHub Pages serves the repo's raw source, so every file the site
  references must exist and be in the `pages.yml` publish allowlist (`pnpm check:refs` checks it).
  Vite is only the local dev server.
- **Vanilla JS modules, not React.** Browser code lives in `main.js` and `modules/`. Use
  `globalThis`, not `window` or `self` (ESLint enforces it).
- **Design tokens, no hardcoded values** (`pnpm lint:css`): spacing from `--space-*`, type from
  `--font-size-*`, `--font-weight-*`, `--letter-spacing-*`, `--line-height-*`. `clamp()`, `max()`,
  `min()` and `env()` are allowed. Fixed control sizes use `rem`, because the larger spacing tokens
  shrink at 768px and below.
- **Icons** come from the SVG sprite: add one in `scripts/build-icons.mjs`, run
  `pnpm build:icons`, render it with `icon('name')` from `modules/utils/icon.js`.
- **Escape anything interpolated into `innerHTML`** with `escapeHtml()` and validate URLs with
  `safeUrl()` (both in `modules/utils/html.js`).
- **Reuse the shared helpers** in `modules/utils/` (`activity.js`, `data.js` `loadJSON()`,
  `while-visible.js`) instead of copying logic. The Worker imports `activity.js` too.
- **Generated files** (`github-data.json`, `og/*.png`, `posts/`, `feed.xml`, the sitemap blog
  block) come from scripts and CI. Edit `posts-data.json` and run `pnpm generate:posts`; don't
  hand-edit the output.
- **Done means** `pnpm validate` passes (lint, Stylelint, format, unit tests, `check:refs`) and,
  for UI changes, `pnpm test:e2e`.
- Conventional commits: `type(scope): description`. Don't commit or deploy unless asked.
