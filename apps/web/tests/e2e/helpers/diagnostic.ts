import { DIAGNOSTIC_BANK } from '@englishlearn/learner-model/seed/diagnostic';
import { expect, type Page } from '@playwright/test';
import { AFTER_SUBMIT } from './auth';

/**
 * Pass the native-language step a fresh learner meets on /ru/diagnostic, the
 * way a learner does (helpers/db.ts never writes), and land on the intro.
 */
export async function chooseNativeLanguage(page: Page, endonym = 'Русский') {
  // Already there (e.g. straight from sign-up): no reload, the flow stays clicked through.
  if (new URL(page.url()).pathname !== '/ru/diagnostic') await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Ваш родной язык' })).toBeVisible();
  // The radio itself is visually hidden: the learner clicks its label.
  await page.locator('label', { hasText: endonym }).click();
  await expect(page.getByRole('radio', { name: endonym })).toBeChecked();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeFocused(AFTER_SUBMIT);
}

export const stem = (page: Page) => page.locator('#diagnostic-stem');
export const status = (page: Page) => page.getByRole('status');
export const progress = (page: Page) => page.getByRole('progressbar', { name: 'Прогресс теста' });

/**
 * The key never reaches the browser — the test knows the bank instead: find
 * the question on screen by its stem, then the option holding the answer.
 */
async function keyIndexOnScreen(page: Page): Promise<number> {
  const text = (await stem(page).textContent()) ?? '';
  const question = DIAGNOSTIC_BANK.find((q) => {
    const [before = '', after = ''] = q.content.source.stem.split('___');
    return text.startsWith(before) && text.endsWith(after);
  });
  if (!question) throw new Error(`question not in the bank: ${text}`);
  const { choices, correctIndex } = question.content.source;
  const shown = await page.locator('fieldset label').allTextContents();
  // Each option shows its key hint ("1") before the text.
  const index = shown.findIndex((s) => s.replace(/^\d/, '').trim() === choices[correctIndex]);
  expect(index, `key of ${question.id}`).toBeGreaterThanOrEqual(0);
  return index;
}

/** Answer the current question with the keyboard and wait for the next step. */
export async function answer(page: Page, n: number, how: 'right' | 'dontKnow') {
  await expect(status(page)).toHaveText(`Вопрос ${n} из 16`, AFTER_SUBMIT);
  if (how === 'dontKnow') {
    await page.keyboard.press('0');
  } else {
    await page.keyboard.press(String((await keyIndexOnScreen(page)) + 1));
    await page.keyboard.press('Enter');
  }
  if (n < 16) await expect(status(page)).toHaveText(`Вопрос ${n + 1} из 16`, AFTER_SUBMIT);
}

/** From a fresh learner: the native language, then Start by keyboard. */
export async function start(page: Page) {
  await chooseNativeLanguage(page);
  const button = page.getByRole('button', { name: 'Начать' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(stem(page)).toBeFocused(AFTER_SUBMIT);
}
