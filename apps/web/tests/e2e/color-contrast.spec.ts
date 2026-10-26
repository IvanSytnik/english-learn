import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { registerFreshLearner } from './helpers/auth';
import { chooseNativeLanguage } from './helpers/diagnostic';

// Text contrast (WCAG AA) on the shell screens, in both colour schemes.
// The body follows prefers-color-scheme, so a component that hard-codes a
// light background only breaks in one of them — check both.
// Only the color-contrast rule runs: unrelated axe findings are out of scope here.

async function expectNoContrastViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary ?? v.help}`),
  );
  expect(report, report.join('\n')).toEqual([]);
}

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`color contrast (${colorScheme})`, () => {
    test.use({ colorScheme });

    for (const path of ['/ru', '/ru/login', '/ru/register']) {
      test(`${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await expectNoContrastViolations(page);
      });
    }

    for (const path of [
      '/ru/dashboard',
      '/ru/diagnostic',
      '/ru/exercises',
      '/ru/exercises?minutes=10',
    ]) {
      test(`${path} (signed in)`, async ({ page }) => {
        await registerFreshLearner(page, 'contrast');
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await expectNoContrastViolations(page);
      });
    }

    // A fresh learner's /ru/diagnostic is the language step (above); the intro
    // comes after it, with a choice made.
    test('/ru/diagnostic intro (signed in)', async ({ page }) => {
      await registerFreshLearner(page, 'contrast');
      // A click starts transition-colors; axe must not measure mid-way.
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await chooseNativeLanguage(page);
      await expectNoContrastViolations(page);
    });

    test('/ru/diagnostic language step, a choice selected (signed in)', async ({ page }) => {
      await registerFreshLearner(page, 'contrast');
      // A click starts transition-colors; axe must not measure mid-way.
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/ru/diagnostic');
      await page.locator('label', { hasText: 'Deutsch' }).click();
      await expect(page.getByRole('radio', { name: 'Deutsch' })).toBeChecked();
      await expectNoContrastViolations(page);
    });
  });
}
