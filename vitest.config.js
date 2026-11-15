import { defineConfig } from 'vitest/config';

import { join } from 'node:path';

export default defineConfig({
    // "cloudflare:workers" only exists inside the Workers runtime; tests get a stub
    resolve: {
        alias: {
            'cloudflare:workers': join(
                import.meta.dirname,
                'tests/worker/stubs/cloudflare-workers.js'
            ),
        },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['tests/unit/**/*.test.js'],
                    environment: 'jsdom',
                },
            },
            {
                // Worker tests run in Node (native fetch/Request/Response)
                extends: true,
                test: {
                    name: 'worker',
                    include: ['tests/worker/**/*.test.js'],
                    environment: 'node',
                },
            },
        ],
        globals: false,
        // `pnpm test:coverage`: a report to find what no test touches, not a gate (no thresholds).
        // The browser code mostly runs in Playwright, which this does not see, so a low number for
        // modules/ means "not unit-tested", and the e2e specs may well cover it.
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'html'],
            include: ['main.js', 'sw.js', 'modules/**/*.js', 'worker/**/*.js', 'scripts/**/*.mjs'],
            exclude: ['modules/wasm/hero-core.*'],
        },
    },
});
