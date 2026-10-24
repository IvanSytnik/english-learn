import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, uniqueEmail } from './helpers/auth';

// Primary CTAs: a new learner finds their level first (the diagnostic), and
// practises once the diagnostic has seeded the learner model.

// A fresh account per test: runs are parallel and must not share a learner.
async function registerFreshStudent(page: Page) {
  await page.goto('/ru/register');
  await page.locator('#name').fill('E2E CTA');
  await page.locator('#email').fill(uniqueEmail('cta'));
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
}

test('/ru: the primary CTA offers to find your level and leads to registration', async ({
  page,
}) => {
  await page.goto('/ru');
  const cta = page.getByRole('link', { name: 'Определить уровень' });
  await expect(cta).toHaveAttribute('href', '/ru/register');
});

test('/ru/dashboard: before the diagnostic the CTA leads to /ru/diagnostic, never prefetched', async ({
  page,
}) => {
  // Rendering /diagnostic for a finished attempt writes (ensureBootstrapped):
  // the link must not be fetched until the learner clicks it.
  const diagnosticRequests: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/ru/diagnostic')) diagnosticRequests.push(r.url());
  });
  await registerFreshStudent(page);
  const cta = page.getByRole('link', { name: 'Определить уровень' });
  await expect(cta).toHaveAttribute('href', '/ru/diagnostic');
  await expect(cta).toBeInViewport();
  await page.waitForLoadState('networkidle');
  // Viewport prefetch fires shortly after hydration; give it room to happen.
  await page.waitForTimeout(1_500);
  expect(diagnosticRequests).toEqual([]);
  await expect(page.locator('main a[href="/ru/exercises"]')).toHaveCount(0);
});

test('/ru/diagnostic: no dead end — the intro offers Start', async ({ page }) => {
  await registerFreshStudent(page);
  await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать' })).toBeEnabled();
});
