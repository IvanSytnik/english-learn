import { expect, test } from '@playwright/test';

// Guards the `@source` for packages/ui in globals.css: if Tailwind stops
// scanning the shared components, preflight resets borders and button
// backgrounds and the register form renders unstyled.
// Tailwind scans this file too — never spell out utility class names here,
// or the test will generate the very classes it is checking for.

test('shared Input keeps its border', async ({ page }) => {
  await page.goto('/ru/register');
  const email = page.locator('#email');
  await expect(email).toBeVisible();
  await expect(email).not.toHaveCSS('border-top-width', '0px');
  await expect(email).not.toHaveCSS('border-top-left-radius', '0px');
  // Without the gray border-color utility the border falls back to currentColor.
  const { borderColor, textColor } = await email.evaluate((el) => {
    const style = getComputedStyle(el);
    return { borderColor: style.borderTopColor, textColor: style.color };
  });
  expect(borderColor).not.toBe(textColor);
});

test('shared Button keeps its primary background', async ({ page }) => {
  await page.goto('/ru/register');
  const submit = page.locator('button[type="submit"]');
  await expect(submit).toBeVisible();
  await expect(submit).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});
