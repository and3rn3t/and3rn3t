import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:4173',
        trace: 'on-first-retry',
        // Reduce animation jitter in tests
        reducedMotion: 'reduce',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    // Serve the repo root statically — mirrors GitHub Pages (raw source), which is
    // the actual deployment. vite preview (dist/) breaks variable-path dynamic imports
    // used by lazyLoad() in main.js.
    webServer: {
        command: 'python3 -m http.server 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
