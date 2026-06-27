import { expect, test } from '@playwright/test';

test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/EnglishLearn/);
});

test('login page is reachable', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: /sign in|войти|увійти|anmelden/i })).toBeVisible();
});

test('dashboard requires auth and redirects to /login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});
