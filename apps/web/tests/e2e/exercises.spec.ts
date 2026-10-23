import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT } from './helpers/auth';

// A fresh learner per run: the player writes LearnerEvents, so the shared seed
// student would accumulate history and make selection drift between runs.
async function registerFreshLearner(page: Page) {
  const email = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.englishlearn.dev`;
  await page.goto('/ru/register');
  await page.locator('#name').fill('E2E Player');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
}

/** Answer whatever question is on screen using only the keyboard. */
async function answerWithKeyboard(page: Page) {
  const field = page.getByRole('textbox', { name: 'Ваш ответ' });
  if (await field.isVisible()) {
    await field.fill('answer');
    await field.press('Enter');
  } else {
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
  }
}

test('/ru/exercises: keyboard-only session — don’t know, feedback, continue, answer', async ({
  page,
}) => {
  await registerFreshLearner(page);
  await page.goto('/ru/exercises');

  // Session length first: 10 min preselected, arrows move, Enter starts.
  const ten = page.getByRole('radio', { name: '10 мин', exact: true });
  await expect(ten).toBeChecked();
  await ten.focus();
  await page.keyboard.press('ArrowLeft');
  const five = page.getByRole('radio', { name: '5 мин', exact: true });
  await expect(five).toBeChecked();
  await expect(five).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/ru\/exercises\?minutes=5$/, AFTER_SUBMIT);

  const progress = page.getByRole('progressbar', { name: 'Прогресс сессии' });
  await expect(progress).toHaveAttribute('aria-valuemax', '6');
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  const prompt = page.locator('#exercise-prompt');
  await expect(prompt).toHaveAttribute('lang', 'en');
  await expect(prompt).toContainText(/\S/);

  // 0 = "I don't know": answer revealed inline, prompt stays visible.
  await page.keyboard.press('0');
  const status = page.getByRole('status');
  await expect(status.locator('[data-verdict="dontKnow"]')).toHaveText('Вот ответ', AFTER_SUBMIT);
  await expect(status).toContainText('Ответ:');
  await expect(status.locator('[data-consequence]')).toHaveText(
    /Скоро вернёмся к этому|Вернёмся через/,
  );
  await expect(prompt).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');

  // Enter = Continue → a new question.
  await page.keyboard.press('Enter');
  await expect(status.locator('[data-verdict]')).toHaveCount(0, AFTER_SUBMIT);

  await answerWithKeyboard(page);
  await expect(status.locator('[data-verdict]')).toHaveText(/Верно|Не совсем/, AFTER_SUBMIT);
  await expect(progress).toHaveAttribute('aria-valuenow', '2');

  // Esc = pause → dashboard.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
});

test('/ru/exercises: ?minutes= maps to the server allowlist, anything else shows the picker', async ({
  page,
}) => {
  await registerFreshLearner(page);
  const progress = page.getByRole('progressbar', { name: 'Прогресс сессии' });
  const picker = page.getByRole('group', { name: 'Сколько у вас времени?' });

  await page.goto('/ru/exercises?minutes=20');
  await expect(progress).toHaveAttribute('aria-valuemax', '24');

  for (const query of ['minutes=999', 'minutes=7', 'minutes=5&minutes=10', 'minutes=']) {
    await page.goto(`/ru/exercises?${query}`);
    await expect(picker, query).toBeVisible();
    await expect(progress, query).toHaveCount(0);
  }
});
