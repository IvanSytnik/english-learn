import { expect, test } from '@playwright/test';

// The legal pages: each renders its heading and the shared footer, whose three
// links lead to each other (and nowhere else).

const PAGES = [
  ['/ru/impressum', 'Выходные данные'],
  ['/ru/datenschutz', 'Политика конфиденциальности'],
  ['/ru/credits', 'Благодарности'],
] as const;

for (const [path, title] of PAGES) {
  test(`${path}: heading and the shared footer links`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    const footer = page.getByRole('contentinfo').getByRole('navigation', {
      name: 'Правовая информация',
    });
    const links = footer.getByRole('link');
    await expect(links).toHaveCount(3);
    expect(await links.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(
      PAGES.map(([p]) => p),
    );
  });
}

test('the footer navigates between the legal pages', async ({ page }) => {
  await page.goto('/ru/impressum');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Благодарности' }).click();
  await expect(page).toHaveURL(/\/ru\/credits$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Благодарности' })).toBeVisible();
});
