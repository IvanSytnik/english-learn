import { VOCAB_TOPICS } from '@englishlearn/db/vocab/topics';
import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import { closeDb, itemAttempts, vocabItemWord } from './helpers/db';

test.afterAll(closeDb);

const STAGES = ['new', 'learning', 'familiar', 'known', 'mastered'];

test.describe('guests', () => {
  for (const path of ['/ru/words', '/ru/words/practice']) {
    test(`${path} → /ru/login with callbackUrl`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/ru/login\\?callbackUrl=${encodeURIComponent(path)}$`),
      );
    });
  }
});

test('/ru/words: a fresh learner sees today, the five stages and every topic; sets the daily limit', async ({
  page,
}) => {
  await registerFreshLearner(page, 'words');
  await page.goto('/ru/words');

  await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await expect(page.locator('[data-due-now]')).toHaveText('Повторять пока нечего');
  await expect(page.getByText('Новых слов сегодня: 0 из 10')).toBeVisible();
  await expect(page.locator('[data-stage]')).toHaveCount(STAGES.length);
  for (const stage of STAGES) {
    await expect(page.locator(`[data-stage="${stage}"] dd`)).toHaveText(
      stage === 'new' ? /^[1-9]\d*$/ : '0',
    );
  }
  await expect(page.locator('[data-topic]')).toHaveCount(VOCAB_TOPICS.length);

  const limit = page.getByLabel('Новых слов в день');
  await expect(limit).toHaveValue('10');
  await limit.fill('15');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('status')).toHaveText('Сохранено', AFTER_SUBMIT);
  await expect(page.getByText('Новых слов сегодня: 0 из 15')).toBeVisible(AFTER_SUBMIT);

  // Stored, not just shown: a fresh render reads it back.
  await page.reload();
  await expect(page.getByLabel('Новых слов в день')).toHaveValue('15');
  await expect(page.getByText('Новых слов сегодня: 0 из 15')).toBeVisible();
});

test('/ru/words/practice: "I know" on a new word → a cued recall proof without a hint → recorded', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-proof');
  await page.goto('/ru/words');
  await page.getByRole('link', { name: 'Учить слова' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/practice$/, AFTER_SUBMIT);

  // A fresh learner's first card is a new word, English shown: "I know" is offered.
  await expect(page.locator('[data-mode="en_to_l1"]')).toBeVisible(AFTER_SUBMIT);
  const word = (await page.locator('#vocab-prompt p[lang="en"]').first().innerText()).trim();
  expect(word).not.toBe('');
  await expect(page.getByRole('button', { name: /^Я знаю это слово/ })).toBeVisible();

  await page.keyboard.press('k');
  await expect(page.locator('[data-proof]')).toHaveText('Проверка знакомого слова', AFTER_SUBMIT);
  await expect(page.locator('[data-mode="cued_recall"]')).toHaveText(
    'Докажите: напишите английское слово. Первая буква подсказана.',
  );
  await expect(page.locator('[data-cue]')).toBeVisible();
  // Proving knowledge takes no hint, and "I know" is not offered twice.
  await expect(page.getByRole('button', { name: /^Подсказка/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Я знаю это слово/ })).toHaveCount(0);

  const answer = page.getByRole('textbox', { name: 'Ваш ответ' });
  await expect(answer).toBeFocused();
  await answer.fill(word);
  await answer.press('Enter');
  await expect(page.locator('[data-proven]')).toHaveText(
    'Доказано: слово отмечено как известное',
    AFTER_SUBMIT,
  );

  // One vocabulary attempt, in recall mode, flagged as a passed proof.
  const attempts = await itemAttempts(email);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({
    conceptId: expect.stringMatching(/^vocab\./),
    correct: true,
    mode: 'recall',
    proof: true,
    rating: 'EASY',
    // B6.1: the card shown, its language and the typed answer as graded.
    variant: 'cued_recall',
    locale: 'ru',
    answerText: word.toLowerCase().replace(/\s+/g, ' '),
  });
  expect(attempts[0]).not.toHaveProperty('hinted');
  expect(attempts[0]).not.toHaveProperty('chosenItemId');
});

test('/ru/words/practice: a wrong choice is stored with the word it was confused with (B6.1)', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-confusion');
  await page.goto('/ru/words/practice');

  // A fresh learner's cards are new words, English shown, Russian options.
  // Pick option 1 until one is wrong (each card: 3 in 4).
  let picked = '';
  for (let card = 1; ; card++) {
    expect(card, 'every first option was right').toBeLessThanOrEqual(10);
    await expect(page.locator('[data-mode="en_to_l1"]')).toBeVisible(AFTER_SUBMIT);
    picked = (
      await page.locator('[data-player-option] span.font-content').first().innerText()
    ).trim();
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    const verdict = page.locator('[data-verdict]');
    await expect(verdict).toBeVisible(AFTER_SUBMIT);
    if ((await verdict.getAttribute('data-verdict')) === 'incorrect') break;
    await page.keyboard.press('Enter');
  }

  const attempts = await itemAttempts(email);
  const wrong = attempts.at(-1);
  expect(wrong).toMatchObject({
    correct: false,
    rating: 'AGAIN',
    mode: 'recognition',
    variant: 'en_to_l1',
    locale: 'ru',
    chosenItemId: expect.any(String),
  });
  expect(wrong).not.toHaveProperty('answerText');
  expect(wrong?.chosenItemId).not.toBe(wrong?.itemId);
  // The stored distractor is the word whose gloss the learner clicked.
  const confused = await vocabItemWord(wrong?.chosenItemId as string);
  expect(confused).toMatchObject({ kind: 'VOCAB_WORD', ru: picked });
  // The right answers before it carry the card, never a chosen item.
  for (const right of attempts.slice(0, -1)) {
    expect(right).toMatchObject({ correct: true, variant: 'en_to_l1', locale: 'ru' });
    expect(right).not.toHaveProperty('chosenItemId');
  }
});
