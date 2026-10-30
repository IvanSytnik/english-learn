import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { registerFreshLearner } from './helpers/auth';

// The top bar: the theme toggle (no flash on reload), the language switch, and
// no horizontal overflow on the narrowest phones.

const DARK_SURFACE = 'rgb(27, 25, 22)'; // tokens.css dark --color-surface

async function overflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('the theme toggle switches to dark, and a reload paints dark from the first frame', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/ru');
  const toggle = page.getByRole('button', { name: 'Тёмная тема' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Read before any client script: the head script alone must have applied it.
  await page.reload({ waitUntil: 'domcontentloaded' });
  const firstPaint = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    background: getComputedStyle(document.body).backgroundColor,
  }));
  expect(firstPaint).toEqual({ theme: 'dark', background: DARK_SURFACE });

  // An explicit dark over a light OS still passes contrast.
  const { violations } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(violations.flatMap((v) => v.nodes.map((n) => n.target.join(' ')))).toEqual([]);

  await page.getByRole('button', { name: 'Тёмная тема' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the language switch keeps the page: /ru/dashboard → /de/dashboard', async ({ page }) => {
  await registerFreshLearner(page, 'topbar');
  await page.getByRole('list', { name: 'Язык' }).getByRole('link', { name: 'Deutsch' }).click();
  await expect(page).toHaveURL(/\/de\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dein Dashboard');
  // The whole document switched, not only the server part: <html lang> and the
  // client islands (the switcher's own label) are German too.
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(
    page.getByRole('list', { name: 'Sprache' }).getByText('DE', { exact: true }),
  ).toHaveAttribute('aria-current', 'true');

  // Back to the default locale: unprefixed, and the cookie no longer pulls it to /de.
  await page.getByRole('list', { name: 'Sprache' }).getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(new URL(page.url()).pathname).toBe('/dashboard');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your dashboard');
});

for (const width of [320, 375]) {
  test(`${width} px: no horizontal overflow on the landing and the student pages`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/ru', '/uk', '/de', '/']) {
      await page.goto(path);
      expect(await overflow(page), path).toBeLessThanOrEqual(0);
    }
    await registerFreshLearner(page, 'mobile');
    for (const path of ['/ru/dashboard', '/ru/words', '/ru/settings', '/de/dashboard']) {
      await page.goto(path);
      await expect(page.locator('[data-top-bar-controls]')).toBeVisible();
      expect(await overflow(page), path).toBeLessThanOrEqual(0);
    }
  });
}
