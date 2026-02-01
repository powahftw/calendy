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

        test('drag creation and overlap', async ({ page }) => {
            // 0. Create Single Event on Jan 14
            const middleCell = page.locator('.day-cell').filter({ hasText: '14' }).first();
            await middleCell.click();
            await page.waitForSelector('.modal-overlay .modal');
            await page.fill('.modal-overlay .modal input[type="text"]', 'Overlap Target');
            await page.click('.modal-overlay .modal button:has-text("Save")');
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            // 1. Drag from Jan 13 to Jan 18
            const startCell = page.locator('.day-cell').filter({ hasText: '13' }).first();
            const endCell = page.locator('.day-cell').filter({ hasText: '18' }).first();

            // Perform drag
            await startCell.hover();
            await page.mouse.down();
            await endCell.hover();
            await page.mouse.up();

            // 2. Add Name "Long Vacation"
            await page.waitForSelector('.modal-overlay .modal');
            const titleInput = page.locator('.modal-overlay .modal input[type="text"]');
            await titleInput.fill('Long Vacation');

            // 3. Select non-default color (e.g., index 2 - Pink/Red depending on palette)
            const colorOptions = page.locator('.color-circle');
            await colorOptions.nth(2).click();

            // 4. Click Save
            await page.click('.modal-overlay .modal button:has-text("Save")');

            // 5. Wait for modal to close
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            // 6. Screenshot
            await expect(page).toHaveScreenshot('planner-drag-overlap.png', {
                fullPage: true,
            });
        });

        test('drag event to next month with overlap preview', async ({ page }) => {
            // Helper to find a day cell by number within a specific month column to avoid text overlap issues
            const findDay = (monthIdx: number, day: number) =>
                page.locator('.month-col').nth(monthIdx)
                    .locator('.day-cell')
                    .filter({ has: page.locator('.day-num').filter({ hasText: new RegExp(`^${day}$`) }) })
                    .first();

            // 1. Create Source Event (5 days): Jan 18 - Jan 22
            const jan18 = findDay(0, 18);
            const jan22 = findDay(0, 22);

            await jan18.hover();
            await page.mouse.down();
            await jan22.hover();
            await page.mouse.up();

            await page.waitForSelector('.modal-overlay .modal');
            await page.fill('.modal-overlay .modal input[type="text"]', 'To Drag');
            // Select pink color (index 2)
            await page.locator('.color-circle').nth(2).click();
            await page.click('.modal-overlay .modal button:has-text("Save")');
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            // 2. Create Target Event (3 days): Feb 16 - Feb 18
            const feb16 = findDay(1, 16);
            const feb18 = findDay(1, 18);

            await feb16.hover();
            await page.mouse.down();
            await feb18.hover();
            await page.mouse.up();

            await page.waitForSelector('.modal-overlay .modal');
            await page.fill('.modal-overlay .modal input[type="text"]', 'Test1');
            await page.locator('.color-circle').nth(0).click(); // Blue
            await page.click('.modal-overlay .modal button:has-text("Save")');
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            // 3. Grab Middle of Source (Jan 20)
            const sourceChip = page.locator('.draggable-chip-style').filter({ hasText: 'To Drag' }).first();

            // 4. Drag to Feb 13
            const feb13 = findDay(1, 13);

            await sourceChip.scrollIntoViewIfNeeded();
            const box = await sourceChip.boundingBox();
            if (!box) throw new Error('Source chip not found');

            // Move to center of chip and press down
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();

            // Move slightly to trigger drag sensor
            await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2);
            await page.waitForTimeout(200);

            // Ensure target is visible
            await feb13.scrollIntoViewIfNeeded({ timeout: 5000 });
            const targetBox = await feb13.boundingBox();
            if (!targetBox) throw new Error('Target cell not found');

            // Move to target center
            await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
            // Extra small move to ensure drag-over detection
            await page.mouse.move(targetBox.x + targetBox.width / 2 + 5, targetBox.y + targetBox.height / 2);

            // Wait for preview to render and settle
            await page.waitForTimeout(1000);

            // 5. Screenshot the PREVIEW state
            await expect(page).toHaveScreenshot('planner-drag-preview-next-month.png', {
                fullPage: true,
            });

            // Cleanup: Drop it
            await page.mouse.up();
        });
        test('provisional and emoji events', async ({ page }) => {
            // 1. Create Striped Event (Color Index 5)
            const day15 = page.locator('.day-cell').filter({ hasText: '15' }).first();
            await day15.click();
            await page.waitForSelector('.modal-overlay .modal');
            await page.fill('.modal-overlay .modal input[type="text"]', 'Provisional Striped');
            await page.locator('.color-circle').nth(5).click(); // Striped
            await page.click('.modal-overlay .modal button:has-text("Save")');
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            // 2. Create Dotted Event (Color Index 6)
            const day16 = page.locator('.day-cell').filter({ hasText: '16' }).first();
            await day16.click();
            await page.waitForSelector('.modal-overlay .modal');
            await page.fill('.modal-overlay .modal input[type="text"]', 'Provisional Dotted');
            await page.locator('.color-circle').nth(6).click(); // Dotted
            await page.click('.modal-overlay .modal button:has-text("Save")');
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            // 3. Create Emoji Event (Icon Only)
            const day17 = page.locator('.day-cell').filter({ hasText: '17' }).first();
            await day17.click();
            await page.waitForSelector('.modal-overlay .modal');

            // Click cycle button to select Swiss Flag
            await page.click('.emoji-picker-btn'); // 1st click

            // Select Transparent (Index 7)
            await page.locator('.color-circle').nth(7).click();

            await page.click('.modal-overlay .modal button:has-text("Save")');
            await page.waitForSelector('.modal-overlay', { state: 'hidden' });

            await expect(page).toHaveScreenshot('provisional-emoji-events.png', {
                fullPage: true,
            });
        });
    });
});
