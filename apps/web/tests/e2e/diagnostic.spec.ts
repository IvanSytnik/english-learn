import AxeBuilder from '@axe-core/playwright';
import { DIAGNOSTIC_BANK } from '@englishlearn/learner-model/seed/diagnostic';
import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, uniqueEmail } from './helpers/auth';
import { closeDb, diagnosticFootprint } from './helpers/db';

// A fresh learner per test: the diagnostic is taken once per learner, and
// runs are parallel.
async function registerFreshLearner(page: Page) {
  const email = uniqueEmail('diag');
  await page.goto('/ru/register');
  await page.locator('#name').fill('E2E Diagnostic');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
  return email;
}

const stem = (page: Page) => page.locator('#diagnostic-stem');
const status = (page: Page) => page.getByRole('status');
const progress = (page: Page) => page.getByRole('progressbar', { name: 'Прогресс теста' });

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
async function answer(page: Page, n: number, how: 'right' | 'dontKnow') {
  await expect(status(page)).toHaveText(`Вопрос ${n} из 16`, AFTER_SUBMIT);
  if (how === 'dontKnow') {
    await page.keyboard.press('0');
  } else {
    await page.keyboard.press(String((await keyIndexOnScreen(page)) + 1));
    await page.keyboard.press('Enter');
  }
  if (n < 16) await expect(status(page)).toHaveText(`Вопрос ${n + 1} из 16`, AFTER_SUBMIT);
}

async function start(page: Page) {
  await page.goto('/ru/diagnostic');
  const button = page.getByRole('button', { name: 'Начать' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(stem(page)).toBeFocused(AFTER_SUBMIT);
}

test.afterAll(closeDb);

test('/ru/diagnostic: the intro, and opening it creates no attempt', async ({ page }) => {
  const email = await registerFreshLearner(page);
  await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeVisible();
  await expect(page.getByText('16 коротких вопросов')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
  await page.reload();
  expect((await diagnosticFootprint(email)).attempts).toEqual([]);
});

test('/ru/diagnostic: a full pass by keyboard, all right → done, and the bootstrap ran', async ({
  page,
}) => {
  // 16 server actions in a row: 16–18 s locally against Neon dev, too close
  // to the 30 s default.
  test.setTimeout(60_000);
  const email = await registerFreshLearner(page);
  await start(page);
  await expect(stem(page)).toHaveAttribute('lang', 'en');
  for (let n = 1; n <= 16; n++) await answer(page, n, 'right');

  const done = page.getByRole('heading', { name: 'Готово!' });
  await expect(done).toBeFocused(AFTER_SUBMIT);
  await expect(page.getByRole('link', { name: 'К практике' })).toHaveAttribute(
    'href',
    '/ru/exercises',
  );
  // No verdict was ever shown.
  await expect(page.locator('[data-verdict]')).toHaveCount(0);

  const footprint = await diagnosticFootprint(email);
  expect(footprint.attempts).toEqual([{ status: 'COMPLETED', assessedLevel: 'C1', answers: 16 }]);
  // Bootstrap-only signals: the event and prior-only mastery rows.
  expect(footprint.bootstrapEvents).toBe(1);
  expect(footprint.priors).toBeGreaterThan(0);

  // Coming back shows the result, not a new attempt.
  await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Готово!' })).toBeVisible();
  expect((await diagnosticFootprint(email)).attempts).toHaveLength(1);
});

test('/ru/diagnostic: a reload resumes at the next question', async ({ page }) => {
  const email = await registerFreshLearner(page);
  await start(page);
  for (let n = 1; n <= 5; n++) await answer(page, n, n % 2 === 0 ? 'dontKnow' : 'right');
  await page.reload();
  await expect(status(page)).toHaveText('Вопрос 6 из 16', AFTER_SUBMIT);
  await expect(progress(page)).toHaveAttribute('aria-valuenow', '5');
  expect((await diagnosticFootprint(email)).attempts).toEqual([
    { status: 'IN_PROGRESS', assessedLevel: null, answers: 5 },
  ]);
});

test('/ru/diagnostic: "I don\'t know" all the way → done at A2', async ({ page }) => {
  // 16 server actions in a row: 16–18 s locally against Neon dev, too close
  // to the 30 s default.
  test.setTimeout(60_000);
  const email = await registerFreshLearner(page);
  await start(page);
  for (let n = 1; n <= 16; n++) await answer(page, n, 'dontKnow');
  await expect(page.getByRole('heading', { name: 'Готово!' })).toBeVisible(AFTER_SUBMIT);
  const footprint = await diagnosticFootprint(email);
  expect(footprint.attempts).toEqual([{ status: 'COMPLETED', assessedLevel: 'A2', answers: 16 }]);
  expect(footprint.bootstrapEvents).toBe(1);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`/ru/diagnostic: text contrast on a question (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await registerFreshLearner(page);
    await start(page);
    await page.keyboard.press('1'); // a selected option too
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const report = violations.flatMap((v) =>
      v.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? v.help}`),
    );
    expect(report, report.join('\n')).toEqual([]);
  });
}
