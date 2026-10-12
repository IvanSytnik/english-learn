import { expect, test } from '@playwright/test';

// The proxy matcher skips these extensions, so before [locale]/layout.tsx checked the
// segment they were served by app/[locale] as the landing page with a 200.

test('/robots.txt → 200 text/plain, disallows /api, never mentions admin', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^text\/plain/);
  const body = await res.text();
  expect(body).toMatch(/^Disallow: \/api$/m);
  expect(body).not.toMatch(/admin/i);
});

test('the icon route serves an SVG and the landing page links it', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="icon"]').getAttribute('href');
  expect(href).toMatch(/^\/icon\.svg/);

  const res = await request.get(href ?? '');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\/svg\+xml/);
});

for (const path of ['/favicon.ico', '/missing.png', '/xx']) {
  test(`${path} → 404 page, not the landing page`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
}
