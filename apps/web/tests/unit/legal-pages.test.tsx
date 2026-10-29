import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
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

const { default: ImpressumPage } = await import('@/app/[locale]/(marketing)/impressum/page');
const { default: DatenschutzPage } = await import('@/app/[locale]/(marketing)/datenschutz/page');
const { default: CreditsPage } = await import('@/app/[locale]/(marketing)/credits/page');

async function renderIn(locale: Locale, Page: () => Promise<React.ReactElement>) {
  current.locale = locale;
  render(await Page());
}

const heading = (level: number, name: string) => screen.getByRole('heading', { level, name });

describe.each(Object.keys(MESSAGES) as Locale[])('legal pages (%s)', (locale) => {
  const legal = MESSAGES[locale].legal;

  it('impressum: title, operator, location, contact link and disclaimer', async () => {
    await renderIn(locale, ImpressumPage);
    const { impressum } = legal;
    expect(heading(1, impressum.title)).toBeInTheDocument();
    expect(heading(2, impressum.disclaimerTitle)).toBeInTheDocument();
    expect(screen.getByText(impressum.operatorValue)).toBeInTheDocument();
    expect(screen.getByText(impressum.locationValue)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: impressum.contactEmail })).toHaveAttribute(
      'href',
      `mailto:${impressum.contactEmail}`,
    );
  });

  it('datenschutz: title, section headings and every processor', async () => {
    await renderIn(locale, DatenschutzPage);
    const { datenschutz } = legal;
    expect(heading(1, datenschutz.title)).toBeInTheDocument();
    for (const title of [
      datenschutz.processorsTitle,
      datenschutz.cookiesTitle,
      datenschutz.rightsTitle,
    ]) {
      expect(heading(2, title)).toBeInTheDocument();
    }
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(Object.values(datenschutz.processors));
  });

  it('credits: title and section headings', async () => {
    await renderIn(locale, CreditsPage);
    const { credits } = legal;
    expect(heading(1, credits.title)).toBeInTheDocument();
    expect(heading(2, credits.cefrjTitle)).toBeInTheDocument();
    expect(heading(2, credits.fontsTitle)).toBeInTheDocument();
  });
});
