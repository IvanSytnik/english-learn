import { type APIRequestContext, expect, test } from '@playwright/test';
import { login, STUDENT } from './helpers/auth';

/** Follows redirects by hand; fails on a loop instead of hanging or hitting a generic limit. */
async function followRedirects(request: APIRequestContext, start: string, maxHops = 3) {
  const hops: string[] = [start];
  let url = start;
  for (let i = 0; i <= maxHops; i++) {
    const res = await request.get(url, { maxRedirects: 0 });
    const location = res.headers().location;
    if (res.status() < 300 || res.status() >= 400 || !location) {
      return { status: res.status(), hops };
    }
    const next = new URL(location, 'http://placeholder');
    url = `${next.pathname}${next.search}`;
    expect(hops, `redirect loop: ${[...hops, url].join(' → ')}`).not.toContain(url);
    hops.push(url);
  }
  throw new Error(`more than ${maxHops} redirects: ${hops.join(' → ')}`);
}

function locationOf(headers: Record<string, string>): string {
  const next = new URL(headers.location ?? '', 'http://placeholder');
  return `${next.pathname}${next.search}`;
}

test.describe('guests', () => {
  test('/ru/dashboard → 307 to /ru/login with callbackUrl', async ({ page, request }) => {
    const res = await request.get('/ru/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(locationOf(res.headers())).toBe('/ru/login?callbackUrl=%2Fru%2Fdashboard');

    await page.goto('/ru/dashboard');
    await expect(page).toHaveURL(/\/ru\/login\?callbackUrl=%2Fru%2Fdashboard$/);
  });

  test('/dashboard → 307 to /login with callbackUrl', async ({ request }) => {
    const res = await request.get('/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(locationOf(res.headers())).toBe('/login?callbackUrl=%2Fdashboard');
  });

  // The old matcher skipped any path containing a dot, so this never reached the proxy.
  test('a dotted path in a protected zone still goes through the proxy', async ({ request }) => {
    const res = await request.get('/ru/exercises/jane.doe', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(locationOf(res.headers())).toBe('/ru/login?callbackUrl=%2Fru%2Fexercises%2Fjane.doe');
  });

  test('/ru/admin/users → 404 without a redirect to login', async ({ page, request }) => {
    const res = await request.get('/ru/admin/users', { maxRedirects: 0 });
    expect(res.status()).toBe(404);

    const nav = await page.goto('/ru/admin/users');
    expect(nav?.status()).toBe(404);
    await expect(page).toHaveURL(/\/ru\/admin\/users$/);
  });

  test('/ru//admin/users → 308 to /ru/admin/users → 404, not login', async ({ page, request }) => {
    const res = await request.get('/ru//admin/users', { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(locationOf(res.headers())).toBe('/ru/admin/users');

    const nav = await page.goto('/ru//admin/users');
    expect(nav?.status()).toBe(404);
    await expect(page).toHaveURL(/\/ru\/admin\/users$/);
  });

  test('/ru//dashboard → 308 → /ru/login with a collapsed callbackUrl', async ({
    page,
    request,
  }) => {
    const { hops } = await followRedirects(request, '/ru//dashboard');
    expect(hops).toEqual([
      '/ru//dashboard',
      '/ru/dashboard',
      '/ru/login?callbackUrl=%2Fru%2Fdashboard',
    ]);

    await page.goto('/ru//dashboard');
    await expect(page).toHaveURL(/\/ru\/login\?callbackUrl=%2Fru%2Fdashboard$/);
  });

  test('/api/health → 200 without a session', async ({ request }) => {
    const res = await request.get('/api/health', { maxRedirects: 0 });
    expect(res.status()).toBe(200);
  });

  for (const path of [
    '/',
    '/ru',
    '/login',
    '/ru/login',
    '/register',
    '/dashboard',
    '/ru/tutor',
    '/ru//',
    '/ru//login',
    '/ru//admin/users',
  ]) {
    test(`no redirect loop from ${path}`, async ({ request }) => {
      const { status } = await followRedirects(request, path);
      expect(status).toBeLessThan(500);
    });
  }
});

test.describe('signed-in student', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, STUDENT);
  });

  test('/ru/login → /ru/dashboard', async ({ page }) => {
    const res = await page.request.get('/ru/login', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(locationOf(res.headers())).toBe('/ru/dashboard');

    await page.goto('/ru/login');
    await expect(page).toHaveURL(/\/ru\/dashboard$/);
  });

  for (const path of ['/login', '/ru/register', '/dashboard', '/ru/dashboard', '/ru/tutor']) {
    test(`no redirect loop from ${path}`, async ({ page }) => {
      const { status } = await followRedirects(page.request, path);
      expect(status).toBeLessThan(500);
    });
  }
});
