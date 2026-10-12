import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, STUDENT } from './helpers/auth';

// Accounts created here live on a dedicated domain so they are easy to clean up.
function uniqueEmail(tag: string) {
  return `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.englishlearn.dev`;
}

async function submitRegister(page: Page, user: { name: string; email: string; password: string }) {
  await page.locator('#name').fill(user.name);
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('button[type="submit"]').click();
}

test.describe('register on /ru/register', () => {
  test('success → /ru/dashboard', async ({ page }) => {
    await page.goto('/ru/register');
    await submitRegister(page, {
      name: 'E2E Student',
      email: uniqueEmail('ok'),
      password: 'password1234',
    });
    await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  });

  test('duplicate email shows a Russian error, stays on the page, no error page', async ({
    page,
  }) => {
    await page.goto('/ru/register');
    await submitRegister(page, { name: 'Dup', email: STUDENT.email, password: 'password1234' });
    await expect(page.locator('form [role="alert"]')).toHaveText(
      'Аккаунт с этим email уже существует.',
      AFTER_SUBMIT,
    );
    await expect(page).toHaveURL(/\/ru\/register$/);
    await expect(page.getByText(/couldn.t load|server error/i)).toHaveCount(0);
    // Name and email are kept, the password is not.
    await expect(page.locator('#name')).toHaveValue('Dup');
    await expect(page.locator('#email')).toHaveValue(STUDENT.email);
    await expect(page.locator('#password')).toHaveValue('');
  });

  test('too short password shows a Russian message under the field', async ({ page }) => {
    await page.goto('/ru/register');
    const email = uniqueEmail('short');
    await submitRegister(page, { name: 'Short', email, password: 'short' });
    await expect(page.locator('#password-error')).toHaveText(
      'Пароль должен быть не короче 8 символов.',
      AFTER_SUBMIT,
    );
    await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/ru\/register$/);
    await expect(page.locator('#email')).toHaveValue(email);
    await expect(page.locator('#password')).toHaveValue('');
  });
});
