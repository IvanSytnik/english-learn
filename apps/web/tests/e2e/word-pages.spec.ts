import { expect, type Locator, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import { closeDb, itemAttempts, lexemePreferences, vocabItemWord } from './helpers/db';

// B6.6: the topic and collection word pages — rows by level, the learner's
// stage badge, Prioritize / I know / Hide, pages of 100 — and their effect on
// the session. `work_jobs` holds more than 100 published words: two pages.

test.afterAll(closeDb);

const COLLECTION = '/ru/words/collections/work_jobs';
const SESSION = '/ru/words/practice?collection=work_jobs';

const rows = (page: Page) => page.locator('[data-word]');
const headwordOf = async (row: Locator) =>
  (await row.locator('[lang="en"]').first().innerText()).trim();
/** Every row of a headword (a homograph has one per part of speech). */
const rowsOf = (page: Page, word: string) =>
  rows(page).filter({ has: page.locator('[lang="en"]', { hasText: new RegExp(`^${word}$`) }) });

/** The intro card's word; nothing is recorded by showing it. */
async function introWord(page: Page) {
  const intro = page.locator('[data-intro]');
  await expect(intro).toBeVisible(AFTER_SUBMIT);
  return (await intro.getByRole('heading', { level: 2 }).innerText()).trim();
}

test.describe('guests', () => {
  for (const path of ['/ru/words/topics/travel', COLLECTION]) {
    test(`${path} → /ru/login with callbackUrl`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(
        new RegExp(`/ru/login\\?callbackUrl=${encodeURIComponent(path)}$`),
      );
    });
  }
});

test('a collection page: prioritize a word → the collection session opens on it', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-prio');
  await page.goto('/ru/words');
  await page.getByRole('link', { name: 'Работа и профессии: все слова' }).click();
  await expect(page).toHaveURL(new RegExp(`${COLLECTION}$`), AFTER_SUBMIT);
  await expect(page.getByRole('heading', { level: 1, name: 'Работа и профессии' })).toBeVisible();
  await expect(rows(page)).toHaveCount(100);

  // The last row of page 1: not the word a session would start with.
  const target = rows(page).last();
  const word = await headwordOf(target);
  const slug = await target.getAttribute('data-word');
  await expect(target.locator('[data-badge]')).toHaveText('Не начато');
  await target.getByRole('button', { name: `В приоритет: «${word}»` }).click();
  await expect(target).toHaveAttribute('data-preference', 'PRIORITIZED');
  await expect(target.getByText('В приоритете')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: `${word}: в приоритете` })).toBeAttached(
    AFTER_SUBMIT,
  );

  // Stored, not just shown.
  await page.reload();
  await expect(page.locator(`[data-word="${slug}"]`)).toHaveAttribute(
    'data-preference',
    'PRIORITIZED',
  );
  expect(await lexemePreferences(email)).toEqual([{ lemma: word, state: 'PRIORITIZED' }]);

  // No due review for a fresh learner: the prioritized word is the first new one.
  await page.getByRole('link', { name: 'Тренировать эту подборку' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/practice\?collection=work_jobs$/, AFTER_SUBMIT);
  expect(await introWord(page)).toBe(word);
});

test('a collection page: a hidden word is never served; Unhide stores it back', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-hide');

  // The word this session would start with (its intro card records nothing).
  await page.goto(SESSION);
  const first = await introWord(page);

  await page.goto(COLLECTION);
  const hidden = rowsOf(page, first);
  const count = await hidden.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const row = hidden.nth(i);
    await row.getByRole('button', { name: `Скрыть «${first}»` }).click();
    await expect(row).toHaveAttribute('data-preference', 'HIDDEN');
    await expect(page.getByRole('status').filter({ hasText: `${first}: скрыто` })).toBeAttached(
      AFTER_SUBMIT,
    );
  }
  // Muted, said in words, Unhide only.
  const row = hidden.first();
  await expect(row.getByText('Скрыто')).toBeVisible();
  await expect(row.getByRole('button')).toHaveText(['Показать']);
  await expect(row.getByRole('link')).toHaveCount(0);

  // Three new words in a row: the hidden one is never among them.
  await page.goto(SESSION);
  for (let card = 1; card <= 3; card++) {
    expect(await introWord(page)).not.toBe(first);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-mode="en_to_l1"]')).toBeVisible(AFTER_SUBMIT);
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    const verdict = page.locator('[data-verdict]');
    await expect(verdict).toBeVisible(AFTER_SUBMIT);
    await page.keyboard.press('Enter');
    await expect(verdict).toBeHidden(AFTER_SUBMIT);
  }
  const attempts = await itemAttempts(email);
  expect(attempts).toHaveLength(3);
  for (const attempt of attempts) {
    expect((await vocabItemWord(attempt.itemId as string)).lemma).not.toBe(first);
  }

  await page.goto(COLLECTION);
  for (let i = 0; i < count; i++) {
    const row = rowsOf(page, first).nth(i);
    await row.getByRole('button', { name: `Показать «${first}»` }).click();
    await expect(row).toHaveAttribute('data-preference', 'NONE');
    await expect(
      page.getByRole('status').filter({ hasText: `${first}: снова показано` }),
    ).toBeAttached(AFTER_SUBMIT);
  }
  expect(await lexemePreferences(email)).toEqual([]);
});

test('a collection page: page 2 by Next, back by Previous; past the last page is a 404', async ({
  page,
}) => {
  await registerFreshLearner(page, 'words-pages');
  await page.goto(COLLECTION);
  const nav = page.getByRole('navigation', { name: 'Страницы' });
  await expect(nav.getByText('Страница 1 из 2')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Предыдущая страница' })).toHaveCount(0);
  const total = Number(await page.locator('[data-total]').getAttribute('data-total'));
  expect(total).toBeGreaterThan(100);
  const firstPage = await rows(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-word')),
  );
  const lastLevel = await page.locator('[data-level]').last().getAttribute('data-level');

  await nav.getByRole('link', { name: 'Следующая страница' }).click();
  await expect(page).toHaveURL(new RegExp(`${COLLECTION}\\?page=2$`), AFTER_SUBMIT);
  await expect(nav.getByText('Страница 2 из 2')).toBeVisible();
  await expect(rows(page)).toHaveCount(total - 100);
  const secondPage = await rows(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-word')),
  );
  expect(secondPage.filter((slug) => firstPage.includes(slug))).toEqual([]);
  // Stable order: page 2 goes on from page 1's last level.
  const nextLevel = await page.locator('[data-level]').first().getAttribute('data-level');
  expect((nextLevel ?? '') >= (lastLevel ?? '')).toBe(true);
  await expect(nav.getByRole('link', { name: 'Следующая страница' })).toHaveCount(0);

  await nav.getByRole('link', { name: 'Предыдущая страница' }).click();
  await expect(page).toHaveURL(new RegExp(`${COLLECTION}$`), AFTER_SUBMIT);
  await expect(rows(page).first()).toHaveAttribute('data-word', firstPage[0] as string);

  expect((await page.goto(`${COLLECTION}?page=3`))?.status()).toBe(404);
  expect((await page.goto('/ru/words/collections/food_drink'))?.status()).toBe(404);
});

test('a topic page from its /words card; "I know" on a row opens that word’s proof', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'words-know');
  await page.goto('/ru/words');
  await page.getByRole('link', { name: 'Путешествия: все слова' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/topics\/travel$/, AFTER_SUBMIT);
  await expect(page.getByRole('heading', { level: 2, name: 'Уровень A1' })).toBeVisible();

  const row = rows(page).first();
  const word = await headwordOf(row);
  await row.getByRole('link', { name: `Я знаю «${word}»: доказать` }).click();
  await expect(page).toHaveURL(
    /\/ru\/words\/practice\?prove=[a-z0-9-]+&concept=vocab\.travel\.a1$/,
    AFTER_SUBMIT,
  );
  await expect(page.locator('[data-proof]')).toHaveText('Проверка знакомого слова', AFTER_SUBMIT);
  await expect(page.locator('[data-cue]')).toBeVisible();
  const answer = page.getByRole('textbox', { name: 'Ваш ответ' });
  await answer.fill(word);
  await answer.press('Enter');
  await expect(page.locator('[data-proven]')).toBeVisible(AFTER_SUBMIT);

  const attempts = await itemAttempts(email);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ proof: true, correct: true, conceptId: 'vocab.travel.a1' });
  expect((await vocabItemWord(attempts[0]?.itemId as string)).lemma).toBe(word);

  // Back on the page the word is started: no "I know", no Prioritize.
  await page.goto('/ru/words/topics/travel');
  const proven = rows(page).first();
  await expect(proven.locator('[data-badge]')).not.toHaveText('Не начато');
  await expect(proven.getByRole('link')).toHaveCount(0);
  await expect(proven.getByRole('button')).toHaveText(['Скрыть']);
});

test('K on a new word’s intro card proves it at once (B6.6)', async ({ page }) => {
  const email = await registerFreshLearner(page, 'words-intro-k');
  await page.goto('/ru/words/practice');
  const word = await introWord(page);
  await page.keyboard.press('k');
  await expect(page.locator('[data-proof]')).toHaveText('Проверка знакомого слова', AFTER_SUBMIT);
  await expect(page.locator('[data-intro]')).toHaveCount(0);
  const answer = page.getByRole('textbox', { name: 'Ваш ответ' });
  await expect(answer).toBeFocused();
  await answer.fill(word);
  await answer.press('Enter');
  await expect(page.locator('[data-proven]')).toBeVisible(AFTER_SUBMIT);
  const attempts = await itemAttempts(email);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]).toMatchObject({ proof: true, correct: true, variant: 'cued_recall' });
  expect((await vocabItemWord(attempts[0]?.itemId as string)).lemma).toBe(word);
});
