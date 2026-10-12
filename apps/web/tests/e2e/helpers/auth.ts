import { expect, type Page } from '@playwright/test';

export type Credentials = { email: string; password: string };

// Seed users (packages/db/src/seed.ts).
export const ADMIN: Credentials = { email: 'admin@englishlearn.dev', password: 'admin1234' };
export const STUDENT: Credentials = { email: 'student@englishlearn.dev', password: 'student1234' };

export async function login(page: Page, user: Credentials) {
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
