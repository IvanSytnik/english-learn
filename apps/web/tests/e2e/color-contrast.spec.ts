import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, uniqueEmail } from './helpers/auth';

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

// A fresh account per test: runs are parallel and must not share a learner.
async function registerFreshStudent(page: Page) {
  await page.goto('/ru/register');
  await page.locator('#name').fill('E2E Contrast');
  await page.locator('#email').fill(uniqueEmail('contrast'));
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
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
        await registerFreshStudent(page);
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await expectNoContrastViolations(page);
      });
    }
  });
}
