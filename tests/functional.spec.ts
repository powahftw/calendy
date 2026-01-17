import { test, expect } from '@playwright/test';

test.describe('Guest persistence', () => {
  test('restores guest session when events exist', async ({ page }) => {
    await page.addInitScript(() => {
      const payload = {
        items: [
          {
            id: 'event-1',
            title: 'Stored Event',
            start: '2026-01-14',
            end: '2026-01-14',
            color: 0,
          },
        ],
        updatedAt: Date.now(),
      };
      window.localStorage.setItem('planner_events_guest', JSON.stringify(payload));
    });

    await page.goto('/');
    await page.waitForSelector('.app-container');

    await expect(page.locator('.login-card')).toHaveCount(0);
    await expect(page.locator('.app-container')).toBeVisible();
  });

  test('handles invalid local storage payloads without crashing', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('planner_events_guest', '{');
    });

    await page.goto('/');
    await page.waitForSelector('.app-container');

    await expect(page.locator('.app-container')).toBeVisible();
  });
});
