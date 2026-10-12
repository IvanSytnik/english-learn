import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, login, STUDENT } from './helpers/auth';

test('/ru/exercises (signed in) is Russian only and links to /ru/diagnostic', async ({ page }) => {
  await login(page, STUDENT);
  await page.goto('/ru/exercises');

  const main = page.locator('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('Упражнения');
  await expect(main).toContainText('Упражнения скоро появятся.');
  // No English leftovers or jargon from the old stub.
  expect(await main.innerText()).not.toMatch(/[A-Za-z]/);

  const cta = main.getByRole('link', { name: 'Пройти диагностику' });
  await expect(cta).toHaveAttribute('href', '/ru/diagnostic');
  await cta.click();
  // /ru/diagnostic may be compiled on demand under `next dev`.
  await expect(page).toHaveURL(/\/ru\/diagnostic$/, AFTER_SUBMIT);
});
