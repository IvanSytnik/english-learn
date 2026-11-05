import { VOCAB_TOPICS } from '@englishlearn/db/vocab/topics';
import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import { closeDb, itemAttempts, vocabItemCollections, vocabItemWord } from './helpers/db';

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

test('/ru/words/practice: a new word opens on its intro card → "I know" → a cued recall proof without a hint → recorded', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-proof');
  await page.goto('/ru/words');
  await page.getByRole('link', { name: 'Учить слова' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/practice$/, AFTER_SUBMIT);

  // B6.5: a word never seen opens on its intro card — the word as the heading,
  // the gloss (no assessed level: below B1), focus on Continue; nothing recorded.
  const intro = page.locator('[data-intro]');
  await expect(intro).toBeVisible(AFTER_SUBMIT);
  const word = (await intro.getByRole('heading', { level: 2 }).innerText()).trim();
  expect(word).not.toBe('');
  await expect(intro.locator('[data-meaning="gloss"]')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: /^Дальше/ })).toBeFocused();
  await expect(page.locator('[data-player-option]')).toHaveCount(0);
  expect(await itemAttempts(email)).toHaveLength(0);

  // Enter: the first question, of that same word, English shown: "I know" is offered.
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mode="en_to_l1"]')).toBeVisible(AFTER_SUBMIT);
  await expect(page.locator('#vocab-prompt p[lang="en"]').first()).toHaveText(word);
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

  // A fresh learner's cards are new words: each opens on its intro card (K
  // goes on, like Continue), then English shown, Russian options. Pick option 1
  // until one is wrong (each card: 3 in 4).
  let picked = '';
  for (let card = 1; ; card++) {
    expect(card, 'every first option was right').toBeLessThanOrEqual(10);
    await expect(page.locator('[data-intro]')).toBeVisible(AFTER_SUBMIT);
    await page.keyboard.press('k');
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
    // The next card replaces the feedback after a server round trip: read it
    // only then, or the loop re-reads this card's "correct" verdict.
    await expect(verdict).toBeHidden(AFTER_SUBMIT);
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

test('/ru/words: a collection card starts a session of that collection’s new words (B6.2)', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-collection');
  await page.goto('/ru/words');
  await expect(page.getByRole('heading', { name: 'Подборки' })).toBeVisible();
  await page.getByRole('link', { name: 'Работа и профессии: тренировать' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/practice\?collection=work_jobs$/, AFTER_SUBMIT);

  // Two new words, each introduced, then answered (whatever the verdict): both
  // from the collection.
  for (let card = 1; card <= 2; card++) {
    await expect(page.locator('[data-intro]')).toBeVisible(AFTER_SUBMIT);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-mode="en_to_l1"]')).toBeVisible(AFTER_SUBMIT);
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-verdict]')).toBeVisible(AFTER_SUBMIT);
    if (card < 2) {
      await page.keyboard.press('Enter');
      // The next card, not the last one's feedback.
      await expect(page.locator('[data-verdict]')).toHaveCount(0, AFTER_SUBMIT);
    }
  }
  const attempts = await itemAttempts(email);
  expect(attempts).toHaveLength(2);
  for (const attempt of attempts) {
    expect(await vocabItemCollections(attempt.itemId as string)).toContain('work_jobs');
  }
});
