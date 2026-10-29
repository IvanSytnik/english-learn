import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const MESSAGES = { en, ru, uk, de } as const;
type Locale = keyof typeof MESSAGES;

const { current } = vi.hoisted(() => ({ current: { locale: 'en' as Locale } }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: current.locale,
      messages: MESSAGES[current.locale],
      namespace: namespace as never,
    }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Footer } = await import('@/app/_components/footer');

describe.each(Object.keys(MESSAGES) as Locale[])('Footer (%s)', (locale) => {
  const { legal } = MESSAGES[locale];

  it('links the three legal pages under a labelled nav and shows the copyright', async () => {
    current.locale = locale;
    render(await Footer());

    const footer = screen.getByRole('contentinfo');
    const nav = within(footer).getByRole('navigation', { name: legal.footer.label });
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([
      [legal.impressum.title, '/impressum'],
      [legal.datenschutz.title, '/datenschutz'],
      [legal.credits.title, '/credits'],
    ]);
    expect(within(footer).getByText('© 2026 EnglishLearn')).toBeInTheDocument();
  });
});

describe('Footer placement', () => {
  const APP = join(process.cwd(), 'app/[locale]');
  const importsFooter = (file: string) =>
    readFileSync(file, 'utf8').includes("from '@/app/_components/footer'");

  it.each(['(marketing)/layout.tsx', '(student)/dashboard/page.tsx'])('%s renders it', (file) => {
    expect(importsFooter(join(APP, file))).toBe(true);
  });

  it('the exercise player stays without it', () => {
    const dir = join(APP, '(student)/exercises');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) =>
      f.endsWith('.tsx'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(importsFooter(join(dir, file)), file).toBe(false);
  });
});
