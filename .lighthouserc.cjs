/** @type {import('@lhci/cli').LhciConfig} */
module.exports = {
  ci: {
    collect: {
      url: [process.env.LHCI_URL || 'https://andernet.dev'],
      // Three runs. One run on a shared CI runner swung from 0.66 to 0.98 on the same build
      // (Nov 2026), which made a failing performance gate a coin flip; the performance score
      // is asserted on the median of the three (see `assert` below).
      numberOfRuns: 3,
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
        // median: lhci's default is the best run, which would hide a regression until all three fail
        'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
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
