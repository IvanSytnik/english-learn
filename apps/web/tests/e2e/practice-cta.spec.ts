import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { registerFreshLearner } from './helpers/auth';
import { chooseNativeLanguage } from './helpers/diagnostic';

// Primary CTAs: a new learner finds their level first (the diagnostic), and
// practises once the diagnostic has seeded the learner model.

test('/ru: the primary CTA offers to find your level and leads to registration', async ({
  page,
}) => {
  await page.goto('/ru');
  const cta = page.getByRole('link', { name: 'Определить уровень' });
  await expect(cta).toHaveAttribute('href', '/ru/register');
});

test('/ru/dashboard: before the diagnostic the CTA leads to /ru/diagnostic, never prefetched', async ({
  page,
}) => {
  // Rendering /diagnostic for a finished attempt writes (ensureBootstrapped):
  // the link must not be fetched until the learner clicks it.
  const diagnosticRequests: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/ru/diagnostic')) diagnosticRequests.push(r.url());
  });
  await registerFreshLearner(page, 'cta');
  const cta = page.getByRole('link', { name: 'Определить уровень' });
  await expect(cta).toHaveAttribute('href', '/ru/diagnostic');
  await expect(cta).toBeInViewport();
  await page.waitForLoadState('networkidle');
  // Viewport prefetch fires shortly after hydration; give it room to happen.
  await page.waitForTimeout(1_500);
  expect(diagnosticRequests).toEqual([]);
  await expect(page.locator('main a[href="/ru/exercises"]')).toHaveCount(0);
});

test('/ru/diagnostic: no dead end — the native language, then the intro offers Start', async ({
  page,
}) => {
  await registerFreshLearner(page, 'cta');
  await chooseNativeLanguage(page, 'Другой язык');
  await expect(page.getByRole('button', { name: 'Начать' })).toBeEnabled();
});

test('/ru/dashboard: before anything, the topics by section, locks named, no week', async ({
  page,
}) => {
  await registerFreshLearner(page, 'cta');
  await expect(page.getByRole('heading', { level: 2, name: 'Грамматика' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Словарь' })).toBeVisible();
  // Nothing practised: every open topic is "not started".
  const stages = page.locator('main [data-concept] [data-stage]');
  await expect(stages.first()).toBeVisible();
  for (const stage of await stages.all()) {
    await expect(stage).toHaveAttribute('data-stage', 'NOT_STARTED');
  }
  // The seed graph has prerequisites: a locked topic says what opens it.
  const locked = page.locator('main [data-concept][data-locked="true"]');
  await expect(locked.first()).toContainText(/Откроется после тем[ыи]? «.+»/);
  await expect(locked.locator('[data-stage]')).toHaveCount(0);
  await expect(page.locator('[data-recommended-start]')).toHaveCount(0);
  await expect(page.locator('[data-dashboard-level]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Эта неделя' })).toHaveCount(0);
});

test('/ru/dashboard: a topic opens its sheet; Esc closes it', async ({ page }) => {
  await registerFreshLearner(page, 'cta');
  const topic = page.locator('main button[data-concept][data-locked="false"]').first();
  const title = (await topic.locator('span.font-medium').first().textContent()) ?? '';
  await topic.click();

  const sheet = page.getByRole('dialog', { name: title });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/Грамматика|Словарь/);
  await expect(sheet.locator('[data-stage="NOT_STARTED"]')).toBeVisible();
  await expect(sheet.getByText(/^Отработано 0 из \d+ упражнени[яй] темы$/)).toBeVisible();
  await expect(sheet.getByText('Ещё не практиковалась')).toBeVisible();
  const cta = sheet.getByRole('link', { name: 'Определить уровень' });
  await expect(cta).toHaveAttribute('href', '/ru/diagnostic');

  for (const colorScheme of ['light', 'dark'] as const) {
    // Reduced motion: switched live, colour transitions would be measured mid-way.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    const { violations } = await new AxeBuilder({ page })
      .include('dialog[open]')
      .withRules(['color-contrast'])
      .analyze();
    const report = violations.flatMap((v) =>
      v.nodes.map(
        (node) => `${colorScheme} ${node.target.join(' ')}: ${node.failureSummary ?? v.help}`,
      ),
    );
    expect(report, report.join('\n')).toEqual([]);
  }

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  // Focus goes back to the topic that opened it.
  await expect(topic).toBeFocused();
});

test('/ru/dashboard: a locked topic’s sheet names what opens it', async ({ page }) => {
  await registerFreshLearner(page, 'cta');
  await page.locator('main button[data-concept][data-locked="true"]').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toContainText(/Откроется после тем[ыи]? «.+»/);
  await expect(sheet.locator('[data-stage]')).toHaveCount(0);
  await expect(sheet.getByText(/^Требуется: «.+»/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Закрыть' }).click();
  await expect(sheet).toBeHidden();
});
