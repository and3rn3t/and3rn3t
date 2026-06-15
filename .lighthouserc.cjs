/** @type {import('@lhci/cli').LhciConfig} */
module.exports = {
  ci: {
    collect: {
      url: [process.env.LHCI_URL || 'https://andernet.dev'],
      numberOfRuns: 1,
      settings: {
        // Desktop preset to match how recruiters typically browse portfolios.
        preset: 'desktop',
        chromeFlags: '--no-sandbox --disable-gpu',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'categories:seo': ['warn', { minScore: 0.85 }],
        // Hard block on a11y regressions; warn on perf regressions.
        'color-contrast': ['error', { minScore: 1 }],
        'document-title': ['error', { minScore: 1 }],
        'meta-description': ['warn', { minScore: 1 }],
        viewport: ['error', { minScore: 1 }],
        'image-alt': ['error', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
