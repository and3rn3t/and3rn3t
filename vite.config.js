import { defineConfig } from 'vite';

export default defineConfig({
    // Build configuration
    build: {
        // Output directory
        outDir: 'dist',

        // Generate source maps for debugging
        sourcemap: true,

        // Minification settings
        minify: 'esbuild',

        // Target modern browsers (ES2020+)
        target: 'es2020',

        // Chunk splitting for better caching
        rollupOptions: {
            input: {
                main: 'index.html',
                'wasm-lab': 'wasm-lab.html',
            },
            output: {
                // Chunk file naming
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',

                // Manual chunk splitting.
                // Note: vite build (dist/) is NOT the production deployment — GitHub Pages
                // serves raw source. Only literal-path imports are bundleable; variable-path
                // lazyLoad() calls (ui.js, projects.js, github-api.js, etc.) are excluded.
                manualChunks: {
                    // Theme and navigation (critical path)
                    core: [
                        './modules/debug.js',
                        './modules/theme.js',
                        './modules/mobile.js',
                        './modules/navigation.js',
                    ],
                },
            },
        },

        // CSS code splitting
        cssCodeSplit: true,

        // Asset inlining threshold (4kb)
        assetsInlineLimit: 4096,
    },

    // Development server configuration
    server: {
        port: 3000,
        open: true,
        cors: true,
    },

    // Preview server configuration
    preview: {
        port: 4173,
    },

    // Resolve configuration
    resolve: {
        alias: {
            '@': '/modules',
        },
    },

    // Define global constants
    define: {
        __APP_VERSION__: JSON.stringify('2.0.0'),
    },
});
