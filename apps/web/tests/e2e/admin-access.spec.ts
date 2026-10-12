import { expect, test } from '@playwright/test';
import { ADMIN, login, STUDENT } from './helpers/auth';

test.describe('admin access', () => {
  test('guest on /ru/admin/users gets a localized 404', async ({ page }) => {
    const res = await page.goto('/ru/admin/users');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  });

  test('student on /ru/admin/users gets a 404', async ({ page }) => {
    await login(page, STUDENT);
    const res = await page.goto('/ru/admin/users');
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  });

  test('admin on /ru/admin/users gets the page', async ({ page }) => {
    await login(page, ADMIN);
    const res = await page.goto('/ru/admin/users');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });
});
