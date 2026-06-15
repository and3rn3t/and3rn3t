import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
    // Base recommended rules
    js.configs.recommended,

    // Prettier disables style rules that conflict with prettier formatting
    prettierConfig,

    // Ignore generated/vendored output
    {
        ignores: ['dist/**', 'dist-worker/**', 'vendor/**', 'node_modules/**', 'coverage/**'],
    },

    // Browser modules (modules/)
    {
        files: ['modules/**/*.js', 'main.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Cloudflare-style globals available in modern browsers
                __APP_VERSION__: 'readonly',
            },
        },
        rules: {
            // Prefer globalThis over window/self (documented convention)
            'no-restricted-globals': [
                'error',
                { name: 'window', message: 'Use globalThis instead of window.' },
                { name: 'self', message: 'Use globalThis instead of self.' },
            ],
            // Catch common issues
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'no-console': 'off',
            'prefer-const': 'error',
            'no-var': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
            'prefer-destructuring': ['error', { array: false, object: true }],
            // Use .at(-1) style is a pattern preference — not enforced by ESLint core
            // Optional chaining: enforced by no-unsafe-optional-chaining
            'no-unsafe-optional-chaining': 'error',
        },
    },

    // Cloudflare Worker (worker/)
    {
        files: ['worker/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.worker,
                // Cloudflare Worker globals
                VIEWS_KV: 'readonly',
                GUESTBOOK_KV: 'readonly',
                GH_TOKEN: 'readonly',
                TURNSTILE_SECRET: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'prefer-const': 'error',
            'no-var': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
        },
    },

    // Config files (vite, vitest, playwright, eslint itself, lighthouse — run in Node)
    {
        files: ['*.config.js', '*.config.cjs', '.lighthouserc.cjs', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                process: 'readonly',
            },
        },
        rules: {
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },

    // Unit + worker tests (Vitest)
    {
        files: ['tests/unit/**/*.js', 'tests/worker/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },

    // E2E tests (Playwright — Node process; page.evaluate() callbacks run in browser so window is valid)
    {
        files: ['tests/e2e/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.node,
                // window is used inside page.evaluate() browser-context callbacks
                window: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'prefer-const': 'error',
            'no-var': 'error',
        },
    },

    // Service worker (sw.js — has its own global scope: self, caches, clients, fetch, etc.)
    {
        files: ['sw.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.serviceworker,
            },
        },
        rules: {
            'no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
            ],
            'prefer-const': 'error',
            'no-var': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
        },
    },
];
