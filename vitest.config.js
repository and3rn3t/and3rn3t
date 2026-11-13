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
    },
});
