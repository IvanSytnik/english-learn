import { expect, type Page } from '@playwright/test';

export type Credentials = { email: string; password: string };

// Seed users (packages/db/src/seed.ts).
export const ADMIN: Credentials = { email: 'admin@englishlearn.dev', password: 'admin1234' };
export const STUDENT: Credentials = { email: 'student@englishlearn.dev', password: 'student1234' };

// A sign-in/sign-out action renders its redirect target inside the same request;
// under `next dev` that target may be compiled on demand, so allow more than 5s.
export const AFTER_SUBMIT = { timeout: 15_000 };

// Accounts created by e2e live on a dedicated domain so they are easy to clean up.
export function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.englishlearn.dev`;
}

/**
 * Registers a new student on /ru/register and waits for the dashboard. A fresh
 * account per test: runs are parallel, and the diagnostic and the player write
 * per-learner state that must not leak between tests. `tag` prefixes the email.
 */
export async function registerFreshLearner(page: Page, tag: string): Promise<string> {
  const email = uniqueEmail(tag);
  await page.goto('/ru/register');
  await page.locator('#name').fill(`E2E ${tag}`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
  return email;
}

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
