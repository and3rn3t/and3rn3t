import { defineConfig } from 'vitest/config';

export default defineConfig({
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
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['modules/**/*.js', 'worker/**/*.js'],
            exclude: ['modules/debug.js'],
        },
        globals: false,
    },
});
