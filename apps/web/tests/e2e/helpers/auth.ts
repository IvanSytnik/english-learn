import { expect, type Page } from '@playwright/test';

export type Credentials = { email: string; password: string };

// Seed users (packages/db/src/seed.ts).
export const ADMIN: Credentials = { email: 'admin@englishlearn.dev', password: 'admin1234' };
export const STUDENT: Credentials = { email: 'student@englishlearn.dev', password: 'student1234' };

// A sign-in/sign-out action renders its redirect target inside the same request;
// under `next dev` that target may be compiled on demand, so allow more than 5s.
export const AFTER_SUBMIT = { timeout: 15_000 };

/** Fills and submits the login form on the current page. */
export async function submitLogin(page: Page, user: Credentials) {
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('button[type="submit"]').click();
}

export async function login(page: Page, user: Credentials) {
  await page.goto('/login');
  await submitLogin(page, user);
  await expect(page).toHaveURL(/\/dashboard$/, AFTER_SUBMIT);
}
