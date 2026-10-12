import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { AFTER_SUBMIT, login, STUDENT, submitLogin } from './helpers/auth';

async function setLocaleCookie(context: BrowserContext, locale: string) {
  await context.addCookies([
    { name: 'NEXT_LOCALE', value: locale, domain: 'localhost', path: '/' },
  ]);
}

test.describe('login keeps the URL locale', () => {
  test('/ru/login → /ru/dashboard in Russian', async ({ page }) => {
    await page.goto('/ru/login');
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Дашборд');
  });

  test('safe callbackUrl is honoured', async ({ page }) => {
    await page.goto('/ru/login?callbackUrl=%2Fru%2Fexercises');
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/\/ru\/exercises$/, AFTER_SUBMIT);
  });

  test('callbackUrl query string survives', async ({ page }) => {
    await page.goto('/ru/login?callbackUrl=%2Fru%2Fexercises%3Ftopic%3Dpast');
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/\/ru\/exercises\?topic=past$/, AFTER_SUBMIT);
  });

  test('protocol-relative callbackUrl is ignored (ru)', async ({ page }) => {
    await page.goto('/ru/login?callbackUrl=%2F%2Fevil.com');
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/ru\/dashboard$/, AFTER_SUBMIT);
  });

  test('protocol-relative callbackUrl is ignored (en)', async ({ page }) => {
    await page.goto('/login?callbackUrl=%2F%2Fevil.com');
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/dashboard$/, AFTER_SUBMIT);
  });

  test('wrong password stays on /ru/login with a Russian error, no error page', async ({
    page,
  }) => {
    await page.goto('/ru/login');
    await submitLogin(page, { email: STUDENT.email, password: 'wrong-password' });
    await expect(page.locator('form [role="alert"]')).toHaveText('Неверный email или пароль.');
    await expect(page).toHaveURL(/\/ru\/login$/, AFTER_SUBMIT);
    await expect(page.getByText(/couldn.t load|server error/i)).toHaveCount(0);
  });

  test('unknown email shows the same generic error', async ({ page }) => {
    await page.goto('/ru/login');
    await submitLogin(page, { email: 'nobody@englishlearn.dev', password: 'whatever1' });
    await expect(page.locator('form [role="alert"]')).toHaveText('Неверный email или пароль.');
  });

  test('"Sign up" and "Sign in" links keep callbackUrl', async ({ page }) => {
    await page.goto('/ru/login?callbackUrl=%2Fru%2Fexercises');
    const signUp = page.locator('a[href^="/ru/register"]');
    await expect(signUp).toHaveAttribute('href', '/ru/register?callbackUrl=%2Fru%2Fexercises');
    await signUp.click();
    await expect(page).toHaveURL(/\/ru\/register\?callbackUrl=%2Fru%2Fexercises$/);
    await expect(page.locator('input[type="hidden"][name="callbackUrl"]')).toHaveValue(
      '/ru/exercises',
    );
    await expect(page.locator('a[href^="/ru/login"]')).toHaveAttribute(
      'href',
      '/ru/login?callbackUrl=%2Fru%2Fexercises',
    );
  });
});

test.describe('NEXT_LOCALE=ru cookie on unprefixed URLs (URL locale is the source of truth)', () => {
  test('signed-in: /dashboard → 307 /ru/dashboard', async ({ page, context }) => {
    await login(page, STUDENT);
    await setLocaleCookie(context, 'ru');
    const res = await page.request.get('/dashboard', { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(new URL(res.headers().location ?? '', 'http://x').pathname).toBe('/ru/dashboard');
  });

  test('guest: /dashboard → /ru/login → after login /ru/dashboard, never ru at /dashboard', async ({
    page,
    context,
  }) => {
    await setLocaleCookie(context, 'ru');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/ru\/login\?callbackUrl=%2Fdashboard$/);
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  });

  test('guest: explicit /en/dashboard → after login English at /dashboard', async ({
    page,
    context,
  }) => {
    await setLocaleCookie(context, 'ru');
    await page.goto('/en/dashboard');
    await expect(page).toHaveURL(/\/ru\/login\?callbackUrl=%2Fen%2Fdashboard$/);
    await submitLogin(page, STUDENT);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/dashboard$/, AFTER_SUBMIT);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your dashboard');
  });
});

test('logout from /ru/dashboard → /ru', async ({ page }) => {
  await page.goto('/ru/login');
  await submitLogin(page, STUDENT);
  await expect(page).toHaveURL(/\/ru\/dashboard$/, AFTER_SUBMIT);
  await page.locator('header form button[type="submit"]').click();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/ru$/, AFTER_SUBMIT);
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
});
