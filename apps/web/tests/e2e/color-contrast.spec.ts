import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, registerFreshLearner } from './helpers/auth';
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

    // The landing (ru and de copy) animates its flag: reduced motion before goto,
    // so axe never measures mid-way.
    for (const path of ['/ru', '/de', '/ru/login', '/ru/register']) {
      test(`${path}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
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
        // Islands refresh after mounting (the dashboard's vocabulary card, the
        // week): axe must not measure transition-colors mid-way.
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        if (path === '/ru/dashboard') await expect(page.locator('[data-vocab-card]')).toBeVisible();
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

    // Vocabulary: the overview, a new word's first card, and its proof step
    // (accent badge, cue). Reduced motion from the start: the overview
    // refreshes and the player swaps cards with transition-colors running.
    test('/ru/words (signed in)', async ({ page }) => {
      await registerFreshLearner(page, 'contrast');
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/ru/words');
      await expect(page.locator('[data-topic]').first()).toBeVisible();
      await expectNoContrastViolations(page);
    });

    test('/ru/words/practice, first card and proof (signed in)', async ({ page }) => {
      await registerFreshLearner(page, 'contrast');
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await page.goto('/ru/words/practice');
      await expect(page.locator('[data-mode]')).toBeVisible(AFTER_SUBMIT);
      await expectNoContrastViolations(page);

      await page.keyboard.press('k');
      await expect(page.locator('[data-proof]')).toBeVisible(AFTER_SUBMIT);
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
