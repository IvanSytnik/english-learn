import { expect, type Page } from '@playwright/test';
import { AFTER_SUBMIT } from './auth';

/**
 * Pass the native-language step a fresh learner meets on /ru/diagnostic, the
 * way a learner does (helpers/db.ts never writes), and land on the intro.
 */
export async function chooseNativeLanguage(page: Page, endonym = 'Русский') {
  await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Ваш родной язык' })).toBeVisible();
  // The radio itself is visually hidden: the learner clicks its label.
  await page.locator('label', { hasText: endonym }).click();
  await expect(page.getByRole('radio', { name: endonym })).toBeChecked();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeFocused(AFTER_SUBMIT);
}
