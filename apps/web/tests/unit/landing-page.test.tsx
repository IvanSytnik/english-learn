import { render, screen, within } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const MESSAGES = { en, ru, uk, de } as const;
type Locale = keyof typeof MESSAGES;

const { current } = vi.hoisted(() => ({ current: { locale: 'en' as Locale } }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => current.locale,
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: current.locale,
      messages: MESSAGES[current.locale],
      namespace: namespace as never,
    }),
}));
// Client islands with their own tests (locale-switcher, theme); this suite renders server output.
vi.mock('@/app/_components/top-bar-controls', () => ({ TopBarControls: () => null }));
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ href, locale }: { href: string; locale: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
  // next-intl's Link serialises an object href the same way (locale prefix aside).
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string | { pathname: string; query: Record<string, string> };
    children: ReactNode;
  }) => (
    <a
      href={typeof href === 'string' ? href : `${href.pathname}?${new URLSearchParams(href.query)}`}
      {...rest}
    >
      {children}
    </a>
  ),
}));

const { default: MarketingPage, generateMetadata } = await import(
  '@/app/[locale]/(marketing)/page'
);

/** Server components nest async components; jsdom React renders none, so await them first. */
async function resolve(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolve));
  if (!isValidElement(node)) return node;
  const { type, props } = node as { type: unknown; props: { children?: ReactNode } };
  if (typeof type === 'function' && type.constructor.name === 'AsyncFunction') {
    return resolve(await (type as (p: unknown) => Promise<ReactNode>)(props));
  }
  if (typeof type === 'function') {
    return resolve((type as (p: unknown) => ReactNode)(props));
  }
  if (props.children === undefined) return node;
  return cloneElement(node, undefined, await resolve(props.children));
}

async function renderLanding(locale: Locale) {
  current.locale = locale;
  render(<>{await resolve(<MarketingPage />)}</>);
}

describe.each(Object.keys(MESSAGES) as Locale[])('landing (%s)', (locale) => {
  const m = MESSAGES[locale].marketing;
  const stage = MESSAGES[locale].learning.stage;

  it('header: the wordmark and a text-only "Sign in" to /login', async () => {
    await renderLanding(locale);
    const header = screen.getByRole('banner');
    expect(within(header).getByText(m.header.sheet)).toBeInTheDocument();
    expect(within(header).getByRole('link')).toHaveAttribute('href', '/login');
    expect(within(header).getByRole('link')).toHaveTextContent(MESSAGES[locale].common.signIn);
  });

  it('hero: one h1, the diagnostic CTA, the how-it-works anchor and the note', async () => {
    await renderLanding(locale);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(m.hero.title);
    const hero = screen.getByRole('region', { name: m.hero.title });
    expect(within(hero).getByRole('link', { name: m.hero.primaryCta })).toHaveAttribute(
      'href',
      '/register?callbackUrl=%2Fdiagnostic',
    );
    expect(within(hero).getByRole('link', { name: m.hero.secondaryCta })).toHaveAttribute(
      'href',
      '#how-it-works',
    );
    expect(screen.getByText(m.hero.note)).toBeInTheDocument();
  });

  it('skill map: two real axes, exactly one flagged row with the badge and the coach note', async () => {
    await renderLanding(locale);
    const map = screen.getByRole('figure', { name: m.map.label });
    const axes = within(map)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(axes).toEqual([m.map.grammar, m.map.vocabulary, m.map.program.title]);

    const flagged = map.querySelectorAll('[data-flagged]');
    expect(flagged).toHaveLength(1);
    const row = flagged[0] as HTMLElement;
    expect(row).toHaveTextContent(m.map.rows.presentPerfect);
    expect(row).toHaveTextContent(m.map.focus);
    expect(row).toHaveTextContent(m.map.coachNote);
    expect(row).toHaveTextContent(stage.EMERGING);
    // The flag never relies on colour alone: the badge carries the word.
    expect(within(row).getByText(m.map.focus).closest('[data-focus-badge]')).not.toBeNull();
    expect(map.querySelectorAll('[data-row]')).toHaveLength(6);
  });

  it('problem/shift and value props render every locked line', async () => {
    await renderLanding(locale);
    for (const text of [
      m.problem.title,
      m.problem.typical.path,
      m.problem.typical.result,
      m.problem.ours.path,
      m.problem.difference.text,
      m.values.title,
      m.values.gaps.title,
      m.values.adapt.title,
      m.values.progress.title,
    ]) {
      expect(screen.getAllByText(text, { exact: false }).length, text).toBeGreaterThan(0);
    }
    expect(document.querySelectorAll('[data-sheet]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-value]')).toHaveLength(3);
  });

  it('shows no raw mastery numbers: no percentages, fractions or decimals', async () => {
    await renderLanding(locale);
    // Text nodes one by one: textContent glues "A2" to the next word.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: string[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode.textContent ?? '');
    const text = nodes.join(' ');
    expect(text).not.toMatch(/%|\d\s*\/\s*\d|\d[.,]\d|\bp(Known|_?learn)\b/i);
    // CEFR bands, the chart's row numbers (01–06), "5 minutes" and "0 and 1"
    // (conditional types) are the only digits.
    const digits = text
      .replace(/\b[ABC][12]\b/g, '')
      .replace(/\b0[1-6]\b/g, '')
      .replace(/\b[015]\b/g, '');
    expect(digits).not.toMatch(/\d/);
  });

  it('how it works: the anchor target, three numbered steps and a diagnostic CTA', async () => {
    await renderLanding(locale);
    const section = document.getElementById('how-it-works') as HTMLElement;
    expect(section).not.toBeNull();
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(
      m.howItWorks.title,
    );
    const steps = within(section)
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent);
    expect(steps).toEqual([
      m.howItWorks.steps.diagnostic.title,
      m.howItWorks.steps.practice.title,
      m.howItWorks.steps.progress.title,
    ]);
    expect(within(section).getByRole('link', { name: m.howItWorks.cta })).toHaveAttribute(
      'href',
      '/register?callbackUrl=%2Fdiagnostic',
    );
  });

  it('every diagnostic CTA (hero, how it works, final) signs up into the diagnostic', async () => {
    await renderLanding(locale);
    const ctas = [...document.querySelectorAll('a[data-cta]')].filter(
      (a) => a.getAttribute('data-cta') !== 'secondary',
    );
    expect(ctas.map((a) => a.getAttribute('data-cta'))).toEqual([
      'primary',
      'how-it-works',
      'final',
    ]);
    for (const a of ctas) expect(a).toHaveAttribute('href', '/register?callbackUrl=%2Fdiagnostic');
    expect(screen.getByRole('heading', { level: 2, name: m.finalCta.title })).toBeInTheDocument();
  });

  it('landing nav: only real targets, and a language switch to the other three locales', async () => {
    await renderLanding(locale);
    const nav = screen.getByRole('navigation', { name: m.nav.label });
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.getAttribute('href'), a.getAttribute('hrefLang')]);
    const others = (Object.keys(MESSAGES) as Locale[]).filter((l) => l !== locale);
    expect(links).toEqual([
      ['#how-it-works', null],
      ['/login', null],
      ...others.map((l) => [`/${l}`, l]),
    ]);
    const languages = within(nav).getByRole('list', { name: m.nav.language });
    expect(within(languages).getByText(locale.toUpperCase())).toHaveAttribute(
      'aria-current',
      'true',
    );
    for (const l of others) {
      expect(within(languages).getByRole('link', { name: m.nav.languages[l] })).toHaveAttribute(
        'hrefLang',
        l,
      );
    }
  });

  it('metadata comes from marketing.meta', async () => {
    current.locale = locale;
    expect(await generateMetadata()).toEqual({
      title: m.meta.title,
      description: m.meta.description,
    });
  });
});
