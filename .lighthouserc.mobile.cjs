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
        // Lighthouse's default: a mid-range phone on slow 4G, which is the harder test. The desktop
        // run is .lighthouserc.cjs.
        chromeFlags: '--no-sandbox --disable-gpu',
      },
    },
    assert: {
      assertions: {
        // Measured on the Phase 10 build with production-like compression: perf 99, LCP 1.8 s,
        // TBT 0, CLS 0; accessibility and SEO 100.
        // median: lhci's default is the best run, which would hide a regression until all three fail
        'categories:performance': ['error', { minScore: 0.9, aggregationMethod: 'median' }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
        'categories:seo': ['warn', { minScore: 0.9 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 300 }],
        'color-contrast': ['error', { minScore: 1 }],
        'aria-allowed-role': ['error', { minScore: 1 }],
        'document-title': ['error', { minScore: 1 }],
        viewport: ['error', { minScore: 1 }],
        'image-alt': ['error', { minScore: 1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
