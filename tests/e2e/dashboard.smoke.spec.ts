import { test, expect } from '@playwright/test';

test('home page renders the platform heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Toastmasters Platform' })).toBeVisible();
});
