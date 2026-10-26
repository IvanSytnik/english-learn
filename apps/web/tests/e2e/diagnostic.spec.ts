import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import { closeDb, diagnosticFootprint } from './helpers/db';
import {
  answer,
  bankQuestion,
  chooseNativeLanguage,
  progress,
  start,
  status,
  stem,
} from './helpers/diagnostic';

test.afterAll(closeDb);

test('/ru/diagnostic: the native language comes first — nothing preselected, nothing written on GET', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'diag');
  await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Ваш родной язык' })).toBeVisible();
  const radios = page.getByRole('radio');
  await expect(radios).toHaveCount(4);
  for (const radio of await radios.all()) await expect(radio).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Начать' })).toHaveCount(0);
  await page.reload();
  expect(await diagnosticFootprint(email)).toMatchObject({ attempts: [], nativeLanguage: null });

  // By keyboard: Tab into the group, an arrow picks a language, Enter continues.
  await page.getByRole('radio', { name: 'Русский' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('radio', { name: 'Українська' })).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeFocused(AFTER_SUBMIT);
  expect(await diagnosticFootprint(email)).toMatchObject({ attempts: [], nativeLanguage: 'uk' });
  // Chosen once: a reload goes straight to the intro.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeVisible();
});

test('/ru/diagnostic: the intro, and opening it creates no attempt', async ({ page }) => {
  const email = await registerFreshLearner(page, 'diag');
  await chooseNativeLanguage(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Диагностика' })).toBeVisible();
  await expect(page.getByText('16 коротких вопросов')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
  await page.reload();
  expect((await diagnosticFootprint(email)).attempts).toEqual([]);
});

test('/ru/diagnostic: a full pass by keyboard, all right → the result, and the bootstrap ran', async ({
  page,
}) => {
  // 16 server actions in a row (16–18 s locally against Neon dev), then the
  // dashboard in both schemes: ~30 s alone, over 60 s under a parallel run.
  test.setTimeout(90_000);
  const email = await registerFreshLearner(page, 'diag');
  await start(page);
  await expect(stem(page)).toHaveAttribute('lang', 'en');
  for (let n = 1; n <= 16; n++) await answer(page, n, 'right');

  const done = page.getByRole('heading', { name: 'Готово!' });
  await expect(done).toBeFocused(AFTER_SUBMIT);
  // The result: levels only — overall, then per axis — and a suggested topic.
  await expect(page.getByRole('heading', { name: 'Ваш уровень' })).toBeVisible();
  await expect(page.locator('[data-result-level]')).toHaveText('C1');
  await expect(page.getByText('Грамматика C1 · Словарь C1')).toBeVisible();
  const recommendation = page.getByText(/^Рекомендуем начать с темы «.+»\.$/);
  await expect(recommendation).toBeVisible();
  const startTitle = (await recommendation.textContent())?.match(/«(.+)»/)?.[1] ?? '';
  await expect(page.getByText('%')).toHaveCount(0);
  const toPractice = page.getByRole('link', { name: 'К практике' });
  await expect(toPractice).toHaveAttribute('href', '/ru/exercises');
  // No verdict was ever shown.
  await expect(page.locator('[data-verdict]')).toHaveCount(0);
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(violations.map((v) => v.help)).toEqual([]);

  const footprint = await diagnosticFootprint(email);
  expect(footprint.attempts).toEqual([{ status: 'COMPLETED', assessedLevel: 'C1', answers: 16 }]);
  // Bootstrap-only signals: the event and prior-only mastery rows.
  expect(footprint.bootstrapEvents).toBe(1);
  expect(footprint.priors).toBeGreaterThan(0);

  // Coming back shows the result, not a new attempt.
  await page.goto('/ru/diagnostic');
  await expect(page.getByRole('heading', { name: 'Готово!' })).toBeVisible();
  await expect(page.locator('[data-result-level]')).toHaveText('C1');
  expect((await diagnosticFootprint(email)).attempts).toHaveLength(1);

  // After the diagnostic the dashboard CTA is practice (nothing is due yet)…
  await page.goto('/ru/dashboard');
  await expect(page.getByRole('link', { name: 'Продолжить практику' })).toHaveAttribute(
    'href',
    '/ru/exercises',
  );
  await expect(page.locator('main a[href="/ru/diagnostic"]')).toHaveCount(0);
  // …with the level, the week, and the same start topic as the result.
  await expect(page.locator('[data-dashboard-level]')).toHaveText('Уровень: C1');
  await expect(page.getByRole('heading', { name: 'Эта неделя' })).toBeVisible(AFTER_SUBMIT);
  const recommended = page.locator('main [data-concept]:has([data-recommended-start])');
  await expect(recommended).toHaveCount(1);
  await expect(recommended).toContainText(startTitle);
  for (const colorScheme of ['light', 'dark'] as const) {
    // Reduced motion: switched live, colour transitions would be measured mid-way.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const report = violations.flatMap((v) =>
      v.nodes.map(
        (node) => `${colorScheme} ${node.target.join(' ')}: ${node.failureSummary ?? v.help}`,
      ),
    );
    expect(report, report.join('\n')).toEqual([]);
  }

  // …and the result's CTA lands on practice, not back on the diagnostic.
  await page.goto('/ru/diagnostic');
  await page.getByRole('link', { name: 'К практике' }).click();
  await expect(page).toHaveURL(/\/ru\/exercises$/, AFTER_SUBMIT);
  await expect(page.getByRole('button', { name: 'Начать' })).toBeVisible();
});

test('/ru/diagnostic: a reload resumes at the next question', async ({ page }) => {
  const email = await registerFreshLearner(page, 'diag');
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
  const email = await registerFreshLearner(page, 'diag');
  await start(page);
  for (let n = 1; n <= 16; n++) await answer(page, n, 'dontKnow');
  await expect(page.getByRole('heading', { name: 'Готово!' })).toBeVisible(AFTER_SUBMIT);
  await expect(page.locator('[data-result-level]')).toHaveText('A2');
  await expect(page.getByText('Грамматика A2 · Словарь A2')).toBeVisible();
  const footprint = await diagnosticFootprint(email);
  expect(footprint.attempts).toEqual([{ status: 'COMPLETED', assessedLevel: 'A2', answers: 16 }]);
  expect(footprint.bootstrapEvents).toBe(1);
});

test('/ru/diagnostic/review: every answer next to the key, with why, and no total', async ({
  page,
}) => {
  // 16 server actions in a row, then the review in both schemes.
  test.setTimeout(90_000);
  await registerFreshLearner(page, 'diag');
  // Nothing finished yet: no review, back to the diagnostic.
  await page.goto('/ru/diagnostic/review');
  await expect(page).toHaveURL(/\/ru\/diagnostic$/, AFTER_SUBMIT);

  // The key and the explanations are fetched only when the learner asks:
  // watched from before the result appears, when a viewport prefetch fires.
  const reviewRequests: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/ru/diagnostic/review')) {
      reviewRequests.push(r.url());
    }
  });
  await start(page);
  const plan = (n: number) => (['right', 'wrong', 'dontKnow'] as const)[(n - 1) % 3] ?? 'right';
  for (let n = 1; n <= 16; n++) await answer(page, n, plan(n));
  await expect(page.getByRole('heading', { name: 'Готово!' })).toBeFocused(AFTER_SUBMIT);

  const link = page.getByRole('link', { name: 'Посмотреть разбор' });
  await expect(link).toHaveAttribute('href', '/ru/diagnostic/review');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_500);
  expect(reviewRequests).toEqual([]);
  await link.click();
  await expect(page).toHaveURL(/\/ru\/diagnostic\/review$/, AFTER_SUBMIT);
  await expect(page.getByRole('heading', { level: 1, name: 'Разбор ответов' })).toBeVisible();

  const cards = page.locator('main ol > li[data-review-question]');
  await expect(cards).toHaveCount(16);
  const outcome = { right: 'correct', wrong: 'incorrect', dontKnow: 'dontKnow' } as const;
  for (let n = 1; n <= 16; n++) {
    const card = cards.nth(n - 1);
    await expect(card).toHaveAccessibleName(new RegExp(`^Вопрос ${n} · (Грамматика|Словарь)$`));
    await expect(card).toHaveAttribute('data-outcome', outcome[plan(n)]);
    // The key shown is the bank's, and the learner's pick is where it was.
    const { choices, correctIndex } = bankQuestion(
      (await card.locator('p[lang="en"]').first().textContent()) ?? '',
    );
    const key = card.locator('[data-choice][data-key]');
    await expect(key).toHaveCount(1);
    await expect(key).toContainText(choices[correctIndex] ?? '');
    await expect(key).toContainText('Правильный ответ');
    const chosen = card.locator('[data-choice][data-chosen]');
    if (plan(n) === 'dontKnow') await expect(chosen).toHaveCount(0);
    else {
      await expect(chosen).toContainText('Ваш ответ');
      await expect(chosen).toContainText(
        choices[plan(n) === 'right' ? correctIndex : (correctIndex + 1) % 4] ?? '',
      );
    }
    // Native ru, the bank's explanations are English so far: shown, marked lang="en".
    await expect(card.locator('[data-why] p[lang="en"]')).not.toBeEmpty();
  }
  // A verdict per question, never a total.
  // (Not a page-wide "%": a question itself says "by 10% this year".)
  await expect(page.getByText(/\d+\s*из\s*16/)).toHaveCount(0);
  await expect(page.locator('main > header')).not.toContainText(/\d/);

  for (const colorScheme of ['light', 'dark'] as const) {
    // Reduced motion: switched live, colour transitions would be measured mid-way.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const { violations } = await new AxeBuilder({ page }).analyze();
    const report = violations.flatMap((v) =>
      v.nodes.map((node) => `${colorScheme} ${v.id} ${node.target.join(' ')}: ${v.help}`),
    );
    expect(report, report.join('\n')).toEqual([]);
  }

  await page.getByRole('link', { name: 'К результату' }).click();
  await expect(page.getByRole('heading', { name: 'Готово!' })).toBeVisible(AFTER_SUBMIT);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`/ru/diagnostic: text contrast on a question (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await registerFreshLearner(page, 'diag');
    await start(page);
    await page.keyboard.press('1'); // a selected option too
    const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const report = violations.flatMap((v) =>
      v.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? v.help}`),
    );
    expect(report, report.join('\n')).toEqual([]);
  });
}
