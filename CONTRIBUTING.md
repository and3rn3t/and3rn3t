# Contributing

This is Matt's personal portfolio ([andernet.dev](https://andernet.dev)), but fixes and suggestions
are welcome. For anything non-trivial, open an [issue](https://github.com/and3rn3t/and3rn3t/issues)
first.

## Setup

Requires Node `^24.15.0 || >=26` (see `.nvmrc`) and pnpm 11.

```bash
pnpm install
pnpm dev            # local dev server with hot reload
pnpm validate       # lint + Stylelint + format check + unit tests + file-reference check
pnpm test:e2e       # Playwright + axe, served from the raw source like production
```

The site is vanilla JS served as raw source by GitHub Pages; there is no build step. A Cloudflare
Worker (`worker/`) handles view counts, the guestbook, live activity and dynamic OG cards
(`pnpm worker:dev` to run it locally). See [`AGENTS.md`](AGENTS.md) for the full layout and
commands.

## Making a change

1. Branch from `main` as `type/short-description`, for example `fix/nav-focus`, `feat/rss-link`,
   `docs/readme`, `chore/deps`. Types match the commit types below, plus `refactor/`, `perf/` and
   `style/`.
2. Keep the change focused. Run `pnpm validate` (and `pnpm test:e2e` for UI changes) before
   pushing.
3. Open a pull request and fill in the [template](.github/pull_request_template.md).

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), checked by a `commit-msg` hook:

```
type(scope): short description
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`.

## Code style

- Prettier formats everything (`pnpm format`), ESLint checks JS (`pnpm lint`).
- CSS uses the design tokens in `styles.css`; `pnpm lint:css` rejects raw spacing and type values.
  Details are in [`CLAUDE.md`](CLAUDE.md#css-guidelines).
- Generated files (`github-data.json`, `og/*.png`, `posts/`, `feed.xml`) are produced by scripts and
  CI. To add or edit a post, change `posts-data.json` and run `pnpm generate:posts`.

## Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
