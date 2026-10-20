import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, uniqueEmail } from './helpers/auth';

// Until the diagnostic UI ships, every primary CTA leads to practice and
// nothing points the learner at the stub /diagnostic.

// A fresh account per test: runs are parallel and must not share a learner.
async function registerFreshStudent(page: Page) {
  await page.goto('/ru/register');
  await page.locator('#name').fill('E2E CTA');
  await page.locator('#email').fill(uniqueEmail('cta'));
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
}

test('/ru: the primary CTA offers practice and leads to registration', async ({ page }) => {
  await page.goto('/ru');
  const cta = page.getByRole('link', { name: 'Начать практику' });
  await expect(cta).toHaveAttribute('href', '/ru/register');
  await expect(page.locator('main')).not.toContainText('диагностик');
});

test('/ru/dashboard: the primary CTA leads to /ru/exercises, not the diagnostic', async ({
  page,
}) => {
  await registerFreshStudent(page);
  const cta = page.getByRole('link', { name: 'Начать практику' });
  await expect(cta).toHaveAttribute('href', '/ru/exercises');
  await expect(page.locator('main a[href="/ru/diagnostic"]')).toHaveCount(0);
});

test('/ru/diagnostic: no dead button, a link to practice instead', async ({ page }) => {
  await registerFreshStudent(page);
  await page.goto('/ru/diagnostic');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('main button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'К практике' })).toHaveAttribute(
    'href',
    '/ru/exercises',
  );
});
