import { test, expect } from '@playwright/test';

const MOCKED_DATE = new Date('2026-01-14T12:00:00');

test.describe('Touch Drag Interactions', () => {

    test.beforeEach(async ({ page }) => {
        // Mock Date
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

        // Login as guest
        await page.goto('/');
        await page.waitForLoadState('networkidle');
        await page.click('.login-guest-btn');
        await page.waitForSelector('.app-container');
    });

    test('immediate touch move should NOT start drag (allow scroll)', async ({ page }) => {
        // 1. Create an event
        const dayCell = page.locator('.day-cell').filter({ hasText: '15' }).first();
        await dayCell.click();
        await page.waitForSelector('.modal-overlay .modal');
        await page.fill('.modal-overlay .modal input[type="text"]', 'Touch Test Event');
        await page.click('.modal-overlay .modal button:has-text("Save")');
        await page.waitForSelector('.modal-overlay', { state: 'hidden' });

        // 2. Locate the event chip
        const eventChip = page.locator('.draggable-chip-style').filter({ hasText: 'Touch Test Event' }).first();
        await expect(eventChip).toBeVisible();

        // 3. Simulate Touch Start
        const box = await eventChip.boundingBox();
        if (!box) throw new Error("Event chip not found");

        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;

        await page.mouse.move(startX, startY); // Move mouse there (optional but good for focus)

        // Dispatch touchstart
        await eventChip.dispatchEvent('touchstart', {
            touches: [{ identifier: 0, clientX: startX, clientY: startY }],
            changedTouches: [{ identifier: 0, clientX: startX, clientY: startY }]
        });

        // 4. Simulate Immediate Move (Scroll attempt)
        await eventChip.dispatchEvent('touchmove', {
            touches: [{ identifier: 0, clientX: startX, clientY: startY + 20 }], // Move down 20px
            changedTouches: [{ identifier: 0, clientX: startX, clientY: startY + 20 }]
        });

        // 5. Check if drag started (z-index should be auto or unset, NOT 200)
        // dnd-kit sets z-index: 200 when dragging
        const zIndex = await eventChip.evaluate(el => getComputedStyle(el).zIndex);
        expect(zIndex).not.toBe('200');

        // Cleanup: touchend
        await eventChip.dispatchEvent('touchend', {
            touches: [],
            changedTouches: [{ identifier: 0, clientX: startX, clientY: startY + 20 }]
        });
    });

    test('long press touch SHOULD start drag', async ({ page }) => {
        // 1. Create an event
        const dayCell = page.locator('.day-cell').filter({ hasText: '15' }).first();
        await dayCell.click();
        await page.waitForSelector('.modal-overlay .modal');
        await page.fill('.modal-overlay .modal input[type="text"]', 'Long Press Event');
        await page.click('.modal-overlay .modal button:has-text("Save")');
        await page.waitForSelector('.modal-overlay', { state: 'hidden' });

        const eventChip = page.locator('.draggable-chip-style').filter({ hasText: 'Long Press Event' }).first();

        const box = await eventChip.boundingBox();
        if (!box) throw new Error("Event chip not found");
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;

        // Dispatch touchstart
        await eventChip.dispatchEvent('touchstart', {
            touches: [{ identifier: 0, clientX: startX, clientY: startY }],
            changedTouches: [{ identifier: 0, clientX: startX, clientY: startY }]
        });

        // WAIT for delay (300ms defined in PlannerGrid)
        await page.waitForTimeout(350);

        // Dispatch small move to trigger drag start after delay
        await eventChip.dispatchEvent('touchmove', {
            touches: [{ identifier: 0, clientX: startX + 5, clientY: startY + 5 }],
            changedTouches: [{ identifier: 0, clientX: startX + 5, clientY: startY + 5 }]
        });

        // Give explicit time for React state updates handling the drag
        await page.waitForTimeout(100);

        // Check if drag started
        const zIndex = await eventChip.evaluate(el => getComputedStyle(el).zIndex);
        expect(zIndex).toBe('200');

        // Cleanup
        await eventChip.dispatchEvent('touchend', {
            touches: [],
            changedTouches: [{ identifier: 0, clientX: startX + 5, clientY: startY + 5 }]
        });
    });
});
