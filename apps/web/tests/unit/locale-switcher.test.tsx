import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const MESSAGES = { en, ru, uk, de } as const;
type Locale = keyof typeof MESSAGES;

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/dashboard',
  // as-needed routing: only a forced prefix puts /en in front of the default locale.
  getPathname: ({
    href,
    locale,
    forcePrefix,
  }: {
    href: string;
    locale: string;
    forcePrefix?: boolean;
  }) => (locale === 'en' && !forcePrefix ? href : `/${locale}${href}`),
}));

const { LocaleSwitcher } = await import('@/app/_components/locale-switcher');

describe.each(Object.keys(MESSAGES) as Locale[])('LocaleSwitcher (%s)', (locale) => {
  const t = MESSAGES[locale].common.locale;

  // Forced prefix: /en/dashboard, not /dashboard — the proxy must see the switch.
  it('marks the current locale and links the same page in the other three', () => {
    render(
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        <LocaleSwitcher />
      </NextIntlClientProvider>,
    );
    const list = screen.getByRole('list', { name: t.label });
    expect(within(list).getByText(locale.toUpperCase())).toHaveAttribute('aria-current', 'true');
    const others = (Object.keys(MESSAGES) as Locale[]).filter((l) => l !== locale);
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(others.map((l) => `/${l}/dashboard`));
    for (const [i, l] of others.entries()) {
      expect(links[i]).toHaveAccessibleName(t[l]);
      expect(links[i]).toHaveAttribute('hrefLang', l);
    }
  });
});

describe('top bars carry the language and theme controls', () => {
  const APP = join(process.cwd(), 'app/[locale]');
  it.each([
    '(marketing)/_components/landing-header.tsx',
    '(student)/dashboard/page.tsx',
    '(student)/words/words-overview.tsx',
    '(student)/settings/page.tsx',
  ])('%s', (file) => {
    const source = readFileSync(join(APP, file), 'utf8');
    expect(source).toContain("from '@/app/_components/top-bar-controls'");
    // The bar wraps instead of overflowing at 320 px.
    const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));
    expect(header).toContain('flex-wrap');
    expect(source).toContain('<TopBarControls />');
  });
});
