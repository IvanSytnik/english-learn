import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, uniqueEmail } from './helpers/auth';
import { closeDb, conceptTitle, learnerEvents } from './helpers/db';
import { answer, start } from './helpers/diagnostic';
import { toQuestion } from './helpers/player';

/**
 * The whole first visit, clicked through as a guest would: landing → sign-up
 * → native language → diagnostic → result → practice → the first answer. The
 * other specs cover each screen; this one covers the hand-offs between them,
 * and that the first exercise is the topic the result recommends.
 */

test.afterAll(closeDb);

test('guest → sign-up → diagnostic → the recommended topic is the first exercise', async ({
  page,
}) => {
  // Sign-up, the language step, 16 server actions, the result and practice:
  // ~30 s alone against Neon dev, more under a parallel run (gotcha 124).
  test.setTimeout(90_000);

  // 1. Landing → sign-up, carrying the diagnostic as the callback.
  await page.goto('/ru');
  await page.getByRole('link', { name: 'Пройти бесплатную диагностику' }).first().click();
  await expect(page).toHaveURL(/\/ru\/register\?callbackUrl=%2Fdiagnostic$/);
  const email = uniqueEmail('golden');
  await page.locator('#name').fill('E2E golden');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();

  // 2. Straight to the diagnostic (not the dashboard): language, then 16 answers.
  await expect(page).toHaveURL(/\/ru\/diagnostic$/, AFTER_SUBMIT);
  await start(page);
  for (let n = 1; n <= 16; n++) await answer(page, n, 'right');

  // 3. The result names a topic; the bootstrap reached the learner model.
  const recommendation = page.getByText(/^Рекомендуем начать с темы «.+»\.$/);
  await expect(recommendation).toBeVisible(AFTER_SUBMIT);
  const startTitle = (await recommendation.textContent())?.match(/«(.+)»/)?.[1] ?? '';
  expect(startTitle).not.toBe('');
  const beforePractice = await learnerEvents(email);
  expect(beforePractice.map((e) => e.type)).toEqual(['LEARNER_BOOTSTRAPPED']);

  // 4. Practice: the session picker, then the first exercise is that topic.
  await page.getByRole('link', { name: 'К практике' }).click();
  await expect(page).toHaveURL(/\/ru\/exercises$/, AFTER_SUBMIT);
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect(page).toHaveURL(/\/ru\/exercises\?minutes=10$/, AFTER_SUBMIT);
  await expect(page.locator('header').getByText(startTitle, { exact: true })).toBeVisible();

  // 5. The first answer — "I don't know" works on any question type (gotcha 109).
  // A grammar start topic is unpractised: it opens on its rule card (B3.2).
  await toQuestion(page);
  await page.getByRole('button', { name: /^Не знаю/ }).click();
  await expect(page.getByRole('status').locator('[data-verdict="dontKnow"]')).toBeVisible(
    AFTER_SUBMIT,
  );

  // 6. One outcome, after the bootstrap, on the recommended topic.
  const events = await learnerEvents(email);
  expect(events.map((e) => e.type)).toEqual(['LEARNER_BOOTSTRAPPED', 'ITEM_ATTEMPTED']);
  const [bootstrap, attempt] = events as [(typeof events)[0], (typeof events)[0]];
  expect(attempt.occurredAt).toBeGreaterThan(bootstrap.occurredAt);
  const attempted = attempt.payload as { conceptId: string; dontKnow?: true };
  expect(attempted.dontKnow).toBe(true);
  expect(await conceptTitle(attempted.conceptId, 'ru')).toBe(startTitle);
});
