import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ADMIN, login, registerFreshLearner } from './helpers/auth';

// B5 feedback triage: a learner's report reaches /admin/feedback, the sort
// reorders it, and the CSV export carries it with a formula defused.

test('a learner report → admin sort → CSV export with the formula defused', async ({ page }) => {
  test.setTimeout(60_000);
  const text = `=1+1 csv-e2e ${Date.now()}`;

  await registerFreshLearner(page, 'feedback-csv');
  await page.getByRole('button', { name: 'Обратная связь' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Ваше сообщение' }).fill(text);
  await dialog.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Спасибо! Ваш отзыв отправлен.')).toBeVisible();
  await page.context().clearCookies();

  await login(page, ADMIN);
  await page.goto('/ru/admin/feedback?sort=page');
  const sort = page.getByRole('navigation', { name: 'Сортировка' });
  await expect(sort.getByText('По странице')).toHaveAttribute('aria-current', 'true');
  await sort.getByRole('link', { name: 'Сначала новые' }).click();
  await expect(page).toHaveURL(/\/ru\/admin\/feedback\?sort=newest$/);
  // Newest first: the report just sent is the first row.
  await expect(page.locator('tbody tr').first()).toContainText(text);

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт CSV' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^beta-feedback-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await download.path()) ?? '', 'utf8');
  expect(csv.startsWith('﻿"createdAt","email"')).toBe(true);
  const line = csv.split('\r\n').find((l) => l.includes('csv-e2e'));
  expect(line).toContain(`"'${text}"`);
});
