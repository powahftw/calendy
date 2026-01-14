import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Playwright configuration for visual regression testing.
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',

    // Screenshot comparison tolerance
    expect: {
        toHaveScreenshot: {
            maxDiffPixels: 10,
            threshold: 0.2,
        },
    },

    use: {
        baseURL: BASE_URL,
        trace: 'on-first-retry',
    },

    projects: [
        // Desktop Chrome
        {
            name: 'desktop-chrome',
            use: { ...devices['Desktop Chrome'] },
        },
        // Mobile (iPhone 12 viewport using Chromium)
        {
            name: 'mobile-chromium',
            use: {
                ...devices['iPhone 12'],
                // Override to use Chromium instead of WebKit
                browserName: 'chromium',
            },
        },
    ],

    // Automatically start server before running tests
    // CI: Use preview (serves built dist/) for faster startup
    // Local: Use dev server for hot reload during development
    webServer: {
        command: process.env.CI ? `npm run preview -- --port ${PORT}` : 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
