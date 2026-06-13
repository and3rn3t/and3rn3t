import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Default environment for unit tests
        environment: 'jsdom',
        // Worker tests run in Node (native fetch/Request/Response)
        environmentMatchGlobs: [
            ['tests/worker/**', 'node'],
        ],
        include: ['tests/unit/**/*.test.js', 'tests/worker/**/*.test.js'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['modules/**/*.js', 'worker/**/*.js'],
            exclude: ['modules/debug.js'],
        },
        globals: false,
    },
});
