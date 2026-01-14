import { test, expect } from '@playwright/test';

// Fixed date for consistent screenshots (avoids flaky tests due to "today" marker moving)
const MOCKED_DATE = new Date('2026-01-14T12:00:00');

test.describe('Visual Regression Tests', () => {

    // Mock the date before each test to ensure consistent screenshots
    test.beforeEach(async ({ page }) => {
        // Mock Date to return a fixed time
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

    test.describe('Guest authenticated scenarios', () => {
        test.beforeEach(async ({ page }) => {
            // Login as guest
            await page.goto('/');
            await page.waitForLoadState('networkidle');
            await page.waitForSelector('.login-card');
            await page.click('.login-guest-btn');

            // Wait for the main planner to load
            await page.waitForSelector('.app-container');
        });

        test('settings modal', async ({ page }) => {
            // Open settings modal
            await page.click('button[title="Settings"]');

            // Wait for modal to be visible
            await page.waitForSelector('.modal.settings-modal');

            // Playwright's toHaveScreenshot will automatically wait for the element to be stable
            await expect(page).toHaveScreenshot('settings-modal.png', {
                fullPage: true,
            });
        });

        test('event creation dialog', async ({ page }) => {
            // Click on a day cell to initiate event creation
            const dayCell = page.locator('.day-cell').filter({ hasText: '15' }).first();
            await dayCell.click();

            // Wait for event modal to appear
            await page.waitForSelector('.modal-overlay .modal');

            await expect(page).toHaveScreenshot('event-creation-dialog.png', {
                fullPage: true,
            });
        });

        test('planner with event', async ({ page }) => {
            // Click on a day to open the event modal
            const dayCell = page.locator('.day-cell').filter({ hasText: '15' }).first();
            await dayCell.click();

            // Fill in the event title
            await page.waitForSelector('.modal-overlay .modal');
            const titleInput = page.locator('.modal-overlay .modal input[type="text"]');
            await titleInput.fill('Test Event CI');

            // Click save button
            await page.click('.modal-overlay .modal button:has-text("Save")');

            // Wait for modal to close
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            await expect(page).toHaveScreenshot('planner-with-event.png', {
                fullPage: true,
            });
        });
    });
});
