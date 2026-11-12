/** @type {import('@lhci/cli').LhciConfig} */
module.exports = {
  ci: {
    collect: {
      url: [process.env.LHCI_URL || 'https://andernet.dev'],
      numberOfRuns: 1,
      settings: {
        // Desktop preset to match how recruiters typically browse portfolios. The phone is audited
        // by .lighthouserc.mobile.cjs.
        preset: 'desktop',
        chromeFlags: '--no-sandbox --disable-gpu',
      },
    },
    assert: {
      assertions: {
        // Measured on the Phase 10 build with production-like compression: 100 / 100 / 96 / 100.
        // The thresholds leave room for run-to-run noise but not for a real regression.
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        // Hard block on a11y regressions.
        'color-contrast': ['error', { minScore: 1 }],
        'aria-allowed-role': ['error', { minScore: 1 }],
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
