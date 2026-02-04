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
                main: 'index.html'
            },
            output: {
                // Chunk file naming
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
                
                // Manual chunk splitting
                manualChunks: {
                    // Core modules that change rarely
                    'vendor': [],
                    // Theme and navigation (critical path)
                    'core': [
                        './modules/debug.js',
                        './modules/theme.js',
                        './modules/mobile.js',
                        './modules/navigation.js'
                    ],
                    // Content loading modules
                    'content': [
                        './modules/ui.js',
                        './modules/projects.js',
                        './modules/github-api.js'
                    ],
                    // Analytics and performance (deferred)
                    'analytics': [
                        './modules/analytics.js',
                        './modules/performance.js',
                        './modules/error-handler.js'
                    ]
                }
            }
        },
        
        // CSS code splitting
        cssCodeSplit: true,
        
        // Asset inlining threshold (4kb)
        assetsInlineLimit: 4096
    },
    
    // Development server configuration
    server: {
        port: 3000,
        open: true,
        cors: true
    },
    
    // Preview server configuration
    preview: {
        port: 4173
    },
    
    // Resolve configuration
    resolve: {
        alias: {
            '@': '/modules'
        }
    },
    
    // Define global constants
    define: {
        '__APP_VERSION__': JSON.stringify('2.0.0')
    }
});
