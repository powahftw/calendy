import { test, expect } from '@playwright/test';

// Fixed date for consistent screenshots (avoids flaky tests due to "today" marker moving)
const MOCKED_DATE = new Date('2026-01-14T12:00:00');

/**
 * Calendy now requires a real Google sign-in and reads its events from the
 * Google Calendar API, so the planner grid itself cannot be reached from a
 * cold browser without live credentials. Everything past the login screen is
 * covered by the jsdom integration tests in src/__tests__/App.test.tsx, which
 * stub auth and the Calendar API.
 */
test.describe('Visual Regression Tests', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(`{
            const MockedDate = class extends Date {
                constructor(...args) {
                    if (args.length === 0) {
                        super(${MOCKED_DATE.getTime()});
                    } else {
                        super(...args);
                    }
                }
                static now() {
                    return ${MOCKED_DATE.getTime()};
                }
            };
            window.Date = MockedDate;
        }`);
    });

    test('login screen', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.login-card');

        await expect(page).toHaveScreenshot('login-screen.png', {
            fullPage: true,
        });
    });

    test('login screen offers no guest mode', async ({ page }) => {
        await page.goto('/');
        await page.waitForSelector('.login-card');

        await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
        await expect(page.getByText(/Continue as Guest/i)).toHaveCount(0);
    });
});
