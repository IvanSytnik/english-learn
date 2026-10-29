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

  test('admin on /ru/admin → /ru/admin/users', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/ru/admin');
    await expect(page).toHaveURL(/\/ru\/admin\/users$/);
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });

  test('admin on /admin → /admin/users (default locale stays unprefixed)', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin');
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/admin\/users$/);
  });

  test('admin on /ru/admin/content → /ru/admin/feedback', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/ru/admin/content');
    await expect(page).toHaveURL(/\/ru\/admin\/feedback$/);
    await expect(page.getByRole('heading', { name: 'Отзывы бета-тестеров' })).toBeVisible();
  });

  test('admin nav lists only the live sections', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin/users');
    const nav = page.getByRole('complementary').getByRole('navigation');
    for (const name of ['Diagnostic', 'Skill Tags', 'Users', 'AI Review', 'Feedback']) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    }
    for (const name of ['Vocabulary', 'Grammar', 'Listening']) {
      await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
    }
    for (const path of ['vocab', 'grammar', 'listening']) {
      expect((await page.goto(`/admin/content/${path}`))?.status()).toBe(404);
    }
  });

  test('guest on /ru/admin gets a 404, no redirect', async ({ page }) => {
    const res = await page.goto('/ru/admin');
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/ru\/admin$/);
    await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  });

  test('student on /ru/admin gets a 404, no redirect', async ({ page }) => {
    await login(page, STUDENT);
    const res = await page.goto('/ru/admin');
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/ru\/admin$/);
    await expect(page.getByRole('heading', { name: 'Страница не найдена' })).toBeVisible();
  });

  test('student on /ru/admin/content gets a 404, no redirect', async ({ page }) => {
    await login(page, STUDENT);
    const res = await page.goto('/ru/admin/content');
    expect(res?.status()).toBe(404);
    await expect(page).toHaveURL(/\/ru\/admin\/content$/);
  });
});
