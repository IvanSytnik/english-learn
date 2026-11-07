import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
import { closeDb, wordLists } from './helpers/db';

// B6.7: a word list end to end — create, paste import (preview in its
// groups → confirm), keyboard reorder, add from the catalogue search,
// "Practise this list" (the first new word is the list's), archive, restore.
// B6.7a: `to run` preselects the verb (#39), `was` is a function word (V2-18c),
// and axe finds nothing serious or critical on the lists, a list and the
// paste dialog, light and dark (#37).

test.afterAll(closeDb);

const PASTE = 'went, children, bus stop, to run, apple - яблоко, was, qwerty';

const slugs = (rows: Locator) =>
  rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-row')));
const termsOf = (group: Locator) =>
  group
    .locator('[data-import-term]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-import-term')));

async function introWord(page: Page) {
  const intro = page.locator('[data-intro]');
  await expect(intro).toBeVisible(AFTER_SUBMIT);
  return (await intro.getByRole('heading', { level: 2 }).innerText()).trim();
}

test('guests are sent to log in', async ({ page }) => {
  await page.goto('/ru/words/lists');
  await expect(page).toHaveURL(/\/ru\/login\?callbackUrl=%2Fru%2Fwords%2Flists$/);
});

test('a list: paste → five words → reorder by keyboard → search → practise → archive → restore', async ({
  page,
}) => {
  const email = await registerFreshLearner(page, 'lists');
  await page.goto('/ru/words');
  await page.getByRole('link', { name: 'Мои списки слов' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists$/, AFTER_SUBMIT);
  await page.getByRole('textbox', { name: 'Новый список' }).fill('Поездка');
  await page.getByRole('button', { name: 'Создать список' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists\/[a-z0-9]{20,40}$/, AFTER_SUBMIT);
  const listUrl = page.url();
  const listId = listUrl.split('/').at(-1) ?? '';

  // Paste: the groups, five words preselected, nothing of "qwerty" kept.
  await page.getByRole('button', { name: 'Добавить слова в этот список из текста' }).click();
  const dialog = page.locator('[data-paste-dialog]');
  await dialog.getByRole('textbox', { name: 'Слова или текст' }).fill(PASTE);
  await dialog.getByRole('button', { name: 'Показать совпадения' }).click();
  const group = (name: string) => dialog.locator(`[data-import-group="${name}"]`);
  await expect(group('matched')).toBeVisible(AFTER_SUBMIT);
  expect(await termsOf(group('matched'))).toEqual(['bus stop', 'run', 'apple']);
  expect(await termsOf(group('lemmatized'))).toEqual(['went', 'children']);
  await expect(group('notFound').getByRole('listitem')).toHaveText(['qwerty']);
  await expect(group('functionWords').getByRole('listitem')).toHaveText(['was']);
  await expect(dialog.locator('[data-option="run-verb"]')).toBeChecked();
  await expect(dialog.locator('[data-option="run-noun"]')).not.toBeChecked();
  await expect(dialog.locator('[data-option="go-verb"]')).toBeChecked();
  await expect(dialog.locator('[data-option="child-noun"]')).toBeChecked();
  await expect(dialog.locator('[data-selected]')).toHaveAttribute('data-selected', '5');
  await dialog.getByRole('button', { name: 'Добавить 5 слов' }).click();
  await expect(dialog.locator('[data-import-done]')).toHaveText(
    'Добавлено: 5. Уже были в списке: 0. Не поместилось: 0.',
    AFTER_SUBMIT,
  );
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  const rows = page.locator('[data-row]');
  await expect(rows).toHaveCount(5, AFTER_SUBMIT);
  expect(await wordLists(email)).toEqual([
    {
      title: 'Поездка',
      source: 'CUSTOM',
      archived: false,
      words: ['bus stop', 'run', 'apple', 'go', 'child'],
    },
  ]);

  // Keyboard reorder: Enter on "Move down"; focus stays on the control; stored.
  const before = await slugs(rows);
  const down = rows.first().getByRole('button', { name: 'Переместить «bus stop» ниже' });
  await down.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => slugs(rows)).toEqual([before[1], before[0], ...before.slice(2)]);
  await expect(
    page
      .locator(`[data-row="${before[0]}"]`)
      .getByRole('button', { name: 'Переместить «bus stop» ниже' }),
  ).toBeFocused();
  await expect
    .poll(async () => (await wordLists(email))[0]?.words, AFTER_SUBMIT)
    .toEqual(['run', 'bus stop', 'apple', 'go', 'child']);

  // One more from the catalogue search.
  await page.getByRole('searchbox', { name: 'Добавить слова из каталога' }).fill('dog');
  const dog = page
    .locator('[data-result]')
    .filter({ has: page.locator('[lang="en"]', { hasText: /^dog$/ }) })
    .first();
  await dog.getByRole('button', { name: 'Добавить «dog» в список' }).click();
  await expect(dog.getByText('В списке')).toBeVisible(AFTER_SUBMIT);
  await expect(rows).toHaveCount(6, AFTER_SUBMIT);

  // Practise this list: the first new word is one of the list's.
  await page.getByRole('link', { name: 'Тренировать этот список' }).click();
  await expect(page).toHaveURL(new RegExp(`/ru/words/practice\\?list=${listId}$`), AFTER_SUBMIT);
  expect(['run', 'bus stop', 'apple', 'go', 'child', 'dog']).toContain(await introWord(page));

  // Archive (back to the lists), then restore from the collapsed section.
  await page.goto(listUrl);
  await page.getByRole('button', { name: 'В архив' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists$/, AFTER_SUBMIT);
  await expect(page.locator(`[data-list-card="${listId}"]`)).toHaveCount(0);
  const archived = page.locator('details[data-lists="archived"]');
  await archived.locator('summary').click();
  await archived.getByRole('button', { name: 'Вернуть «Поездка»' }).click();
  await expect(page.locator(`[data-list-card="${listId}"]`)).toBeVisible(AFTER_SUBMIT);
  expect((await wordLists(email))[0]?.archived).toBe(false);
});

test('another learner’s list is a 404, also as a practice scope', async ({ page, browser }) => {
  await registerFreshLearner(page, 'lists-owner');
  await page.goto('/ru/words/lists');
  await page.getByRole('textbox', { name: 'Новый список' }).fill('Мой');
  await page.getByRole('button', { name: 'Создать список' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists\/[a-z0-9]{20,40}$/, AFTER_SUBMIT);
  const listId = page.url().split('/').at(-1) ?? '';

  const other = await browser.newPage();
  await registerFreshLearner(other, 'lists-intruder');
  for (const path of [`/ru/words/lists/${listId}`, `/ru/words/practice?list=${listId}`]) {
    const res = await other.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  await other.close();
});

/** axe, every rule: what is serious or critical, one line per node. */
async function seriousOrCritical(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) => v.nodes.map((n) => `${where} ${v.id} ${n.target.join(' ')}: ${v.help}`));
}

test('axe: the lists, a list and the paste dialog — nothing serious or critical, light and dark', async ({
  page,
}) => {
  await registerFreshLearner(page, 'lists-axe');
  // Reduced motion from the start: axe must never measure transition-colors mid-way.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // An archived list (the collapsed section) and a list with words (rows, badges).
  await page.goto('/ru/words/lists');
  await page.getByRole('textbox', { name: 'Новый список' }).fill('Работа');
  await page.getByRole('button', { name: 'Создать список' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists\/[a-z0-9]{20,40}$/, AFTER_SUBMIT);
  await page.getByRole('button', { name: 'В архив' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists$/, AFTER_SUBMIT);
  await page.getByRole('textbox', { name: 'Новый список' }).fill('Поездка');
  await page.getByRole('button', { name: 'Создать список' }).click();
  await expect(page).toHaveURL(/\/ru\/words\/lists\/[a-z0-9]{20,40}$/, AFTER_SUBMIT);
  const listUrl = page.url();
  const dialog = page.locator('[data-paste-dialog]');
  const preview = async () => {
    await page.getByRole('button', { name: 'Добавить слова в этот список из текста' }).click();
    await dialog.getByRole('textbox', { name: 'Слова или текст' }).fill(PASTE);
    await dialog.getByRole('button', { name: 'Показать совпадения' }).click();
    await expect(dialog.locator('[data-import-group="functionWords"]')).toBeVisible(AFTER_SUBMIT);
  };
  await preview();
  await dialog.getByRole('button', { name: 'Добавить 5 слов' }).click();
  await expect(dialog.locator('[data-import-done]')).toBeVisible(AFTER_SUBMIT);
  await dialog.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('[data-row]')).toHaveCount(5, AFTER_SUBMIT);

  const report: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/ru/words/lists');
    await page.locator('details[data-lists="archived"] summary').click();
    await expect(page.getByRole('button', { name: 'Вернуть «Работа»' })).toBeVisible();
    report.push(...(await seriousOrCritical(page, `${colorScheme} /words/lists`)));
    await page.goto(listUrl);
    await expect(page.locator('[data-row]')).toHaveCount(5);
    report.push(...(await seriousOrCritical(page, `${colorScheme} /words/lists/[id]`)));
    // The dialog over the list: every group, the words already in it disabled.
    await preview();
    report.push(...(await seriousOrCritical(page, `${colorScheme} paste dialog`)));
  }
  expect(report, report.join('\n')).toEqual([]);
});
