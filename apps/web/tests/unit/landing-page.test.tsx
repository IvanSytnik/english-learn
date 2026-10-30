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
  getTranslations: async (namespace: string) =>
    createTranslator({
      locale: current.locale,
      messages: MESSAGES[current.locale],
      namespace: namespace as never,
    }),
}));
vi.mock('@/i18n/navigation', () => ({
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
    expect(screen.getByRole('link', { name: m.hero.primaryCta })).toHaveAttribute(
      'href',
      '/register?callbackUrl=%2Fdiagnostic',
    );
    expect(screen.getByRole('link', { name: m.hero.secondaryCta })).toHaveAttribute(
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

  it('metadata comes from marketing.meta', async () => {
    current.locale = locale;
    expect(await generateMetadata()).toEqual({
      title: m.meta.title,
      description: m.meta.description,
    });
  });
});
