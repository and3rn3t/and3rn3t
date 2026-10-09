import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

// Rules shared by every JS file in the repo.
const baseRules = {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
};

// Extra rules for code that ships (browser modules, Worker, service worker).
const shippedRules = {
    ...baseRules,
    'object-shorthand': 'error',
    'prefer-template': 'error',
    'no-unsafe-optional-chaining': 'error',
};

export default [
    js.configs.recommended,

    // Prettier disables style rules that conflict with prettier formatting
    prettierConfig,

    // Generated output and the AssemblyScript source (not JS)
    {
        ignores: ['dist/**', 'dist-worker/**', 'node_modules/**', 'coverage/**', 'assembly/**'],
    },

    // Everything defaults to modern ES modules with the base rules.
    {
        languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
        rules: baseRules,
    },

    // Browser modules
    {
        files: ['modules/**/*.js', 'main.js'],
        languageOptions: { globals: globals.browser },
        rules: {
            ...shippedRules,
            // Prefer globalThis over window/self (documented convention)
            'no-restricted-globals': [
                'error',
                { name: 'window', message: 'Use globalThis instead of window.' },
                { name: 'self', message: 'Use globalThis instead of self.' },
            ],
            'prefer-destructuring': ['error', { array: false, object: true }],
        },
    },

    // Cloudflare Worker (bindings and secrets arrive on `env`, not as globals)
    {
        files: ['worker/**/*.js'],
        languageOptions: { globals: globals.worker },
        rules: shippedRules,
    },

    // Service worker (its own global scope: self, caches, clients, ...)
    {
        files: ['sw.js'],
        languageOptions: { sourceType: 'script', globals: globals.serviceworker },
        rules: shippedRules,
    },

    // Node: config files and build/maintenance scripts. Scripts that drive Playwright use
    // `document` inside page.evaluate() callbacks, which run in the browser.
    {
        files: ['*.config.js', '*.config.mjs', '.lighthouserc.cjs', 'scripts/**/*.{js,mjs}'],
        languageOptions: { globals: { ...globals.node, document: 'readonly' } },
    },

    {
        files: ['**/*.cjs'],
        languageOptions: { sourceType: 'commonjs' },
    },

    // Unit + worker tests (Vitest)
    {
        files: ['tests/unit/**/*.js', 'tests/worker/**/*.js'],
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
    },

    // E2E tests (Node; page.evaluate()/waitForFunction callbacks run in the browser)
    {
        files: ['tests/e2e/**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                window: 'readonly',
                document: 'readonly',
                getComputedStyle: 'readonly',
            },
        },
    },
];
