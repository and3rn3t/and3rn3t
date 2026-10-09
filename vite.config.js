import { defineConfig } from 'vite';

// Vite is only the local dev server (hot reload). Production is GitHub Pages serving
// the raw source, so there is no build step; `pnpm check:refs` guards what ships.
export default defineConfig({
    server: {
        port: 3000,
        open: true,
    },
});
