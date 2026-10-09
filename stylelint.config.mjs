// Enforces the design-token rules from CLAUDE.md > CSS Guidelines.
//
// A "raw length" is a number with a px/rem/em unit. It is allowed only inside clamp(),
// max(), min() or env() (fluid type and safe-area insets), never at the top level of the
// value. The pattern below walks the value from the start, skipping whole allowed function
// calls (and var(...)), and fails if a raw length turns up at the top level. calc() is not
// skipped, so a raw length inside calc() is still caught.

// An allowed function call, with up to three levels of nested parentheses.
const allowedCall = '(?:clamp|max|min|env|var)\\((?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*\\)';
const rawLength = '(?<![\\w.])\\d*\\.?\\d+(?:px|rem|em)\\b';
const topLevelRawLength = `/^(?:${allowedCall}|calc\\(|\\)|[^()])*?${rawLength}/`;

const message =
  'Use a design-system token (var(--space-*), --font-size-*, --font-weight-*, --letter-spacing-*, --line-height-*). See CLAUDE.md > CSS Guidelines.';

/** @type {import('stylelint').Config} */
export default {
  ignoreFiles: ['dist/**', 'dist-worker/**', 'node_modules/**'],
  rules: {
    'declaration-property-value-disallowed-list': [
      {
        '/^(padding|margin|gap|row-gap|column-gap)(-.+)?$/': [topLevelRawLength],
        'font-size': [topLevelRawLength],
        'letter-spacing': [topLevelRawLength],
        'line-height': ['/^-?\\d*\\.?\\d+$/'],
        'font-weight': ['/^\\d+$/'],
      },
      { message },
    ],
  },
};
