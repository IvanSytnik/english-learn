import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import { closeDb, itemAttemptKeys, itemAttempts, practiceQuestions } from './helpers/db';
import { chooseNativeLanguage } from './helpers/diagnostic';

test.afterAll(closeDb);

/**
 * The question type is Thompson's pick, not the test's. A cloze question has a
 * text field, and the input guard (correctly) sends `0` there as a character,
 * so `0` only means "I don't know" on a choice question.
 */
const answerField = (page: Page) => page.getByRole('textbox', { name: 'Ваш ответ' });

/**
 * Wait until a question is interactive (its text field or its options), so a
 * type check never runs while the next question is still loading.
 */
async function questionType(page: Page): Promise<'cloze' | 'choice'> {
  const field = answerField(page);
  await expect(field.or(page.locator('[data-player-option]').first())).toBeVisible(AFTER_SUBMIT);
  return (await field.isVisible()) ? 'cloze' : 'choice';
}

/** "I don't know" on any question type: the visible button, not the key. */
const dontKnowButton = (page: Page) => page.getByRole('button', { name: /^Не знаю/ });

/** Answer whatever question is on screen using only the keyboard. */
async function answerWithKeyboard(page: Page) {
  const field = answerField(page);
  if ((await questionType(page)) === 'cloze') {
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
  await registerFreshLearner(page, 'player');
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

  // The `0` key needs a choice question: answer cloze questions until one
  // comes up (54 of the 60 items are choice, so this is at most a step or two).
  const status = page.getByRole('status');
  let answered = 0;
  while ((await questionType(page)) === 'cloze') {
    expect(answered, 'no choice question within the session').toBeLessThan(4);
    await answerWithKeyboard(page);
    await expect(status.locator('[data-verdict]')).toBeVisible(AFTER_SUBMIT);
    answered += 1;
    await page.keyboard.press('Enter');
    await expect(status.locator('[data-verdict]')).toHaveCount(0, AFTER_SUBMIT);
  }

  // 0 = "I don't know": answer revealed inline, prompt stays visible.
  await page.keyboard.press('0');
  await expect(status.locator('[data-verdict="dontKnow"]')).toHaveText('Вот ответ', AFTER_SUBMIT);
  await expect(status).toContainText('Ответ:');
  await expect(status.locator('[data-consequence]')).toHaveText(
    /Скоро вернёмся к этому|Вернёмся через/,
  );
  await expect(prompt).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', String(answered + 1));

  // Enter = Continue → a new question.
  await page.keyboard.press('Enter');
  await expect(status.locator('[data-verdict]')).toHaveCount(0, AFTER_SUBMIT);

  await answerWithKeyboard(page);
  await expect(status.locator('[data-verdict]')).toHaveText(/Верно|Не совсем/, AFTER_SUBMIT);
  await expect(progress).toHaveAttribute('aria-valuenow', String(answered + 2));

  // Esc = pause → dashboard.
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);

  // Practice without a diagnostic: the topic shows a stage and the week
  // appears, but the CTA still asks for the level and nothing is recommended.
  await expect(
    page.locator('main [data-concept] [data-stage]:not([data-stage="NOT_STARTED"])').first(),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Эта неделя' })).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByRole('link', { name: 'Определить уровень' })).toBeVisible();
  await expect(page.locator('[data-recommended-start]')).toHaveCount(0);

  // The practised topic's sheet: when, and how much of it.
  await page
    .locator('main button[data-concept]:has([data-stage]:not([data-stage="NOT_STARTED"]))')
    .first()
    .click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/^Последняя практика: .+/)).toBeVisible();
  await expect(sheet.getByText(/^Отработано [1-9]\d* из \d+ упражнени[яй] темы$/)).toBeVisible();
});

test('/ru/exercises: ?minutes= maps to the server allowlist, anything else shows the picker', async ({
  page,
}) => {
  await registerFreshLearner(page, 'player');
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

// Week rhythm counts days in the browser's time zone: pin it so the result
// does not depend on the machine running the suite.
test.describe('session summary (Europe/Vienna)', () => {
  test.use({ timezoneId: 'Europe/Vienna', locale: 'ru-RU' });

  test('/ru/exercises: a 5-minute session ends on the summary, then starts over', async ({
    page,
  }) => {
    await registerFreshLearner(page, 'player');
    await page.goto('/ru/exercises?minutes=5');
    const progress = page.getByRole('progressbar', { name: 'Прогресс сессии' });
    const status = page.getByRole('status');

    for (let done = 1; done <= 6; done++) {
      if (done % 2 === 0) await dontKnowButton(page).click();
      else await answerWithKeyboard(page);
      await expect(status.locator('[data-verdict]')).toBeVisible(AFTER_SUBMIT);
      await expect(progress).toHaveAttribute('aria-valuenow', String(done));
      await page.keyboard.press('Enter');
      if (done < 6) await expect(status.locator('[data-verdict]')).toHaveCount(0, AFTER_SUBMIT);
    }

    const heading = page.getByRole('heading', { name: 'Сессия завершена' });
    await expect(heading).toBeFocused(AFTER_SUBMIT);
    await expect(page.getByText('Вы ответили на 6 вопросов.')).toBeVisible();
    const tally = async (key: string) =>
      Number(await page.locator(`[data-tally="${key}"] dd`).textContent());
    expect((await tally('correct')) + (await tally('incorrect'))).toBe(3);
    expect(await tally('dontKnow')).toBe(3);
    // Every "I don't know" is a learning step: something always comes back soon.
    const review = page.getByRole('region', { name: 'Вернётся на повторение' });
    await expect(review.locator('[data-review="backSoon"]')).toContainText(
      'Скоро вернёмся к этому',
    );

    // Six answers today: today is this week's first session.
    const week = page.getByRole('region', { name: 'Эта неделя' });
    await expect(week).toContainText('1 из 3 сессий', AFTER_SUBMIT);
    await expect(week.locator('li[aria-current="date"]')).toHaveAttribute('data-counted', 'true');
    await expect(week.locator('li[data-counted="true"]')).toHaveCount(1);
    // "Today" is today in Vienna, whatever the clock of the test machine says.
    const viennaToday = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      timeZone: 'Europe/Vienna',
    }).format(new Date());
    await expect(week.locator('li[aria-current="date"]')).toContainText(viennaToday);

    // Text contrast on the summary, in both colour schemes.
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      expect(violations, colorScheme).toEqual([]);
    }

    await page.getByRole('button', { name: 'Ещё одна сессия' }).click();
    await expect(progress).toHaveAttribute('aria-valuenow', '0', AFTER_SUBMIT);
    await expect(progress).toHaveAttribute('aria-valuemax', '6');
  });
});

// Every seed item has a Russian "why", so its script tells the languages apart.
const CYRILLIC = /[а-яё]/i;

test('the "why" follows the native language (ru), the chrome the URL locale (en)', async ({
  page,
}) => {
  await registerFreshLearner(page, 'player');
  await chooseNativeLanguage(page, 'Русский');
  // An explicit /en sets the interface to English (unprefixed URL).
  await page.goto('/en/exercises?minutes=5');
  await expect(page).toHaveURL(/\/exercises\?minutes=5$/, AFTER_SUBMIT);
  await page.getByRole('button', { name: /^I don't know/ }).click();
  const status = page.getByRole('status');
  await expect(status.locator('[data-verdict="dontKnow"]')).toHaveText(
    "Here's the answer",
    AFTER_SUBMIT,
  );
  await expect(status.locator('[data-why]')).toHaveText(CYRILLIC);
});

test('"other" native language: the "why" in English, even on the Russian interface', async ({
  page,
}) => {
  await registerFreshLearner(page, 'player');
  await chooseNativeLanguage(page, 'Другой язык');
  await page.goto('/ru/exercises?minutes=5');
  await dontKnowButton(page).click();
  const status = page.getByRole('status');
  await expect(status.locator('[data-verdict="dontKnow"]')).toHaveText('Вот ответ', AFTER_SUBMIT);
  await expect(status.locator('[data-why]')).toHaveText(/\S/);
  await expect(status.locator('[data-why]')).not.toHaveText(CYRILLIC);
});

/**
 * Answer the question on screen correctly: find it among the published
 * questions by the text around its gap, then type or pick its key.
 */
async function answerRight(page: Page) {
  const type = await questionType(page);
  const text = (await page.locator('#exercise-prompt').textContent()) ?? '';
  const matches = (await practiceQuestions()).filter(({ practice }) => {
    const [before = '', after = ''] = practice.prompt.split('___');
    return practice.type === type && text.startsWith(before) && text.endsWith(after);
  });
  expect(
    matches.map((m) => m.id),
    `question on screen: ${text}`,
  ).toHaveLength(1);
  const { practice } = matches[0] as (typeof matches)[number];
  if (practice.type === 'cloze') {
    await answerField(page).fill(practice.acceptedAnswers[0] as string);
    await answerField(page).press('Enter');
  } else {
    await page.locator('[data-player-option]').nth(practice.correctIndex).click();
    await page.getByRole('button', { name: /^Проверить/ }).click();
  }
}

test('a right answer after the hint is recorded as hinted and rated HARD; the next question starts without it', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'hint');
  await page.goto('/ru/exercises?minutes=5');
  const status = page.getByRole('status');

  // 1. Open the hint and close it again: it still counts.
  const hint = page.getByRole('button', { name: /^Подсказка/ });
  await hint.click();
  await expect(hint).toHaveAttribute('aria-expanded', 'true');
  await hint.click();
  await expect(hint).toHaveAttribute('aria-expanded', 'false');
  await answerRight(page);
  await expect(status.locator('[data-verdict="correct"]')).toBeVisible(AFTER_SUBMIT);

  // 2. The next question starts without the hint.
  await page.getByRole('button', { name: /^Дальше/ }).click();
  await expect(hint).toHaveAttribute('aria-expanded', 'false', AFTER_SUBMIT);
  await answerRight(page);
  await expect(status.locator('[data-verdict="correct"]')).toBeVisible(AFTER_SUBMIT);

  const [hinted, plain] = await itemAttempts(email);
  expect(hinted).toMatchObject({ correct: true, rating: 'HARD', hinted: true });
  expect(plain).toMatchObject({ correct: true, rating: 'GOOD' });
  expect(plain).not.toHaveProperty('hinted');
});

test('a reply lost after the answer was recorded: Retry (Enter) shows it, nothing is recorded twice', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'retry');
  await page.goto('/ru/exercises?minutes=5');
  const status = page.getByRole('status');
  const progress = page.getByRole('progressbar', { name: 'Прогресс сессии' });
  await questionType(page);

  // The next server action — the answer — reaches the server and is recorded,
  // then its reply is dropped: the browser sees a network failure.
  let dropped = false;
  await page.route('**/ru/exercises**', async (route) => {
    const request = route.request();
    if (dropped || request.method() !== 'POST' || !request.headers()['next-action']) {
      return route.fallback();
    }
    dropped = true;
    await route.fetch();
    await route.abort('failed');
  });

  await dontKnowButton(page).click();
  // Next keeps its own (empty) role=alert route announcer outside <main>.
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Ответ не дошёл до сервера',
    AFTER_SUBMIT,
  );
  const retry = page.getByRole('button', { name: 'Повторить' });
  await expect(retry).toBeFocused();
  await expect(progress).toHaveAttribute('aria-valuenow', '0');
  const [key] = await itemAttemptKeys(email);
  expect(key).toMatch(/^[0-9a-f-]{36}$/);

  // Enter on the focused Retry resends with the same key: the server answers
  // from the recorded attempt and writes nothing.
  await page.keyboard.press('Enter');
  await expect(status.locator('[data-verdict="dontKnow"]')).toBeVisible(AFTER_SUBMIT);
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(retry).toHaveCount(0);
  expect(await itemAttemptKeys(email)).toEqual([key]);

  // The next question is a new attempt with a new key.
  await page.keyboard.press('Enter');
  await expect(status.locator('[data-verdict]')).toHaveCount(0, AFTER_SUBMIT);
  await dontKnowButton(page).click();
  await expect(status.locator('[data-verdict="dontKnow"]')).toBeVisible(AFTER_SUBMIT);
  const keys = await itemAttemptKeys(email);
  expect(keys).toHaveLength(2);
  expect(keys[1]).not.toBe(key);
});
