import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, uniqueEmail } from './helpers/auth';
import { closeDb, signupSource } from './helpers/db';

// The landing (B4.2–B4.3, docs/DESIGN.md): the flagged skill map, the
// how-it-works anchor, the language switch, and `?ref=` surviving the CTA.

test.afterAll(closeDb);

test('/ru: the skill map flags exactly one topic, with the word, not colour alone', async ({
  page,
}) => {
  await page.goto('/ru');
  const map = page.getByRole('figure', { name: 'Пример карты навыков' });
  await expect(map).toBeVisible();
  const flagged = map.locator('[data-flagged]');
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText('Present Perfect');
  await expect(flagged.locator('[data-focus-badge]')).toHaveText(/Фокус/i);
});

test('/ru: "See how it works" scrolls to the three steps', async ({ page }) => {
  await page.goto('/ru');
  await page.getByRole('link', { name: 'Как это работает' }).first().click();
  await expect(page).toHaveURL(/\/ru#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await expect(page.locator('#how-it-works [data-step]')).toHaveCount(3);
});

test('/ru: the language switch opens the same landing in German', async ({ page }) => {
  await page.goto('/ru');
  await page.getByRole('link', { name: 'Deutsch' }).click();
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Englisch, das deine Schwachstellen trainiert – nicht die von allen.',
  );
});

test('/ru?ref=…: the source survives the landing CTA into User.signupSource', async ({ page }) => {
  await page.goto('/ru?ref=landing-e2e');
  await page.getByRole('link', { name: 'Пройти бесплатную диагностику' }).first().click();
  await expect(page).toHaveURL(/\/ru\/register\?callbackUrl=%2Fdiagnostic$/);
  const email = uniqueEmail('landing-ref');
  await page.locator('#name').fill('E2E landing ref');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/diagnostic$/, AFTER_SUBMIT);
  expect(await signupSource(email)).toBe('landing-e2e');
});
