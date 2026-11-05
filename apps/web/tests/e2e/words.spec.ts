import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import { VOCAB_TOPICS } from '@englishlearn/db/vocab/topics';
import {
  buildVocabCard,
  cardSeed,
  PAYLOAD_MODE,
  PROOF_MODE,
  pickVariantIndex,
  type VocabMode,
  vocabModeFor,
  vocabVariant,
} from '@englishlearn/learner-model';
import { expect, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import {
  closeDb,
  diagnosticFootprint,
  itemAttempts,
  vocabItemCollections,
  vocabItemWord,
} from './helpers/db';
import { answer, start } from './helpers/diagnostic';
import { closeSeedDb, recordVocabAnswer, reviewState, userIdOf, vocabPool } from './helpers/seed';

test.afterAll(closeDb);
test.afterAll(closeSeedDb);

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

test('/ru/words/practice: a B1 learner gets a definition on rung 2; rung 3 holds the collocation back (B6.5a)', async ({
  page,
}) => {
  // Sign-up, two seeded answers, the whole diagnostic, two cards.
  test.setTimeout(120_000);
  const email = await registerFreshLearner(page, 'words-b1');
  const userId = await userIdOf(email);

  // Two words answered before today, at moments the test fixes: it knows each
  // card's seed, so which word serves which variant, before seeding. The rung-3
  // word is one the collocation would have been served for, before B6.5a.
  //   - proved known 9 days ago (EASY: S ≈ 8.3, +8 d) → a review due now, rung 3;
  //   - right once an hour ago (GOOD: S ≈ 2.3, a 10-min step) → a learning step
  //     due now, rung 2.
  // Seeded first: an explicit moment must come before the diagnostic's events.
  const HOUR = 3_600_000n;
  const now = BigInt(Date.now());
  const provedAt = now - 9n * 24n * HOUR;
  const learntAt = now - HOUR;
  const pool = await vocabPool();
  const cardFor = (word: (typeof pool)[number], mode: VocabMode, lastReviewAt: bigint) =>
    buildVocabCard({
      target: word,
      pool,
      mode,
      locale: 'ru',
      learnerLevel: 'B1',
      seed: cardSeed({ userId, itemId: word.itemId, lastReviewAt }),
    });
  const wouldBeCollocation = (word: (typeof pool)[number]) => {
    const seed = cardSeed({ userId, itemId: word.itemId, lastReviewAt: provedAt });
    const ctx = { pool, locale: 'ru' as const, learnerLevel: 'B1' as const, seed };
    const fits = (['cloze', 'collocation'] as const).filter((id) =>
      vocabVariant(id).eligible(word, ctx),
    );
    return fits.length === 2 && fits[pickVariantIndex(seed, 2)] === 'collocation';
  };
  const reviewed = pool.find(wouldBeCollocation);
  const learning = pool.find(
    (w) => w !== reviewed && cardFor(w, 'l1_to_en', learntAt).view.mode === 'definition_to_en',
  );
  if (!reviewed || !learning) throw new Error('no word fits the variant for these seeds');
  await recordVocabAnswer({
    userId,
    itemId: reviewed.itemId,
    mode: PAYLOAD_MODE[PROOF_MODE],
    correct: true,
    proof: true,
    occurredAtMs: provedAt,
  });
  await recordVocabAnswer({
    userId,
    itemId: learning.itemId,
    mode: PAYLOAD_MODE.en_to_l1,
    correct: true,
    occurredAtMs: learntAt,
  });
  for (const [word, rung, at] of [
    [reviewed, 'cloze', provedAt],
    [learning, 'l1_to_en', learntAt],
  ] as const) {
    const state = await reviewState(userId, word.itemId);
    expect(vocabModeFor(state), word.lemma).toBe(rung);
    expect(state.lastReviewAt).toBe(at);
    expect(state.dueAt).toBeLessThanOrEqual(now);
  }

  // Assessed B1: right and wrong in turn on each axis (odd and even positions)
  // — never two alike in a row, so both ladders hold B1 for all eight questions.
  await start(page);
  for (let n = 1; n <= 16; n++) {
    await answer(page, n, Math.floor((n - 1) / 2) % 2 === 0 ? 'right' : 'wrong');
  }
  await expect(page.getByRole('heading', { name: 'Ваш уровень' })).toBeVisible(AFTER_SUBMIT);
  expect((await diagnosticFootprint(email)).attempts).toMatchObject([
    { status: 'COMPLETED', assessedLevel: 'B1' },
  ]);

  const options = page.locator('[data-player-option] span.font-content');
  async function answerRight(card: ReturnType<typeof cardFor>) {
    if (card.key.kind !== 'choice') throw new Error('choice');
    if (!('options' in card.view)) throw new Error('options');
    await expect(options).toHaveText(card.view.options);
    await page.keyboard.press(String(card.key.correctIndex + 1));
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-verdict="correct"]')).toBeVisible(AFTER_SUBMIT);
  }

  // The review comes first: rung 3 serves cloze — the collocation is held back
  // (no intro: the word was answered before).
  await page.goto('/ru/words/practice');
  const cloze = cardFor(reviewed, 'cloze', provedAt);
  if (cloze.view.mode !== 'cloze') throw new Error('cloze');
  await expect(page.locator('[data-mode="cloze"]')).toBeVisible(AFTER_SUBMIT);
  await expect(page.locator('[data-mode="collocation"]')).toHaveCount(0);
  await expect(page.locator('[data-intro]')).toHaveCount(0);
  for (const part of cloze.view.sentence.split(PRACTICE_GAP)) {
    if (part.trim() !== '') await expect(page.locator('#vocab-prompt')).toContainText(part.trim());
  }
  await answerRight(cloze);
  await page.keyboard.press('Enter');

  // Then the learning step: rung 2 serves the English definition.
  const definition = cardFor(learning, 'l1_to_en', learntAt);
  if (definition.view.mode !== 'definition_to_en') throw new Error('definition_to_en');
  await expect(page.locator('[data-mode="definition_to_en"]')).toBeVisible(AFTER_SUBMIT);
  await expect(page.locator('#vocab-prompt [data-definition]')).toHaveText(
    definition.view.definition,
  );
  await answerRight(definition);

  // Both recorded with the card shown.
  const attempts = await itemAttempts(email);
  expect(attempts).toHaveLength(4);
  expect(attempts.slice(2)).toMatchObject([
    { itemId: reviewed.itemId, correct: true, variant: 'cloze', locale: 'ru' },
    { itemId: learning.itemId, correct: true, variant: 'definition_to_en', locale: 'ru' },
  ]);
});
