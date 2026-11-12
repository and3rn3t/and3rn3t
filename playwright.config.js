import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    // One worker made CI take about five minutes for what runs in about one on four. Three leaves a
    // 4-vCPU runner some room, so the timing-sensitive budget tests are not starved. PW_WORKERS
    // overrides it (set PW_WORKERS=1 to rule out contention when a test flakes on CI).
    workers: Number(process.env.PW_WORKERS) || (process.env.CI ? 3 : undefined),
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:4173',
        trace: 'on-first-retry',
        // Reduce animation jitter in tests
        reducedMotion: 'reduce',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    // Serve the repo root statically — mirrors GitHub Pages (raw source), which is
    // the actual deployment.
    webServer: {
        command: 'python3 -m http.server 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
