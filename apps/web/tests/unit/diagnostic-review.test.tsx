import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagnosticReviewView } from '@/lib/diagnostic';
import ru from '../../messages/ru.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} data-prefetch={String(prefetch ?? true)} {...rest}>
      {children}
    </a>
  ),
}));

const { DiagnosticReview } = await import(
  '@/app/[locale]/(student)/diagnostic/review/diagnostic-review'
);

type Question = DiagnosticReviewView['questions'][number];
const question = (over: Partial<Question>): Question => ({
  position: 0,
  axis: 'GRAMMAR',
  stem: 'She ___ a decision.',
  choices: ['did', 'took', 'made', 'got'],
  chosenIndex: 2,
  correctIndex: 2,
  outcome: 'correct',
  explanation: { text: 'We make a decision.', lang: 'en' },
  ...over,
});

const REVIEW: DiagnosticReviewView = {
  questions: [
    question({}),
    question({ position: 1, axis: 'VOCAB', chosenIndex: 0, outcome: 'incorrect' }),
    question({ position: 2, chosenIndex: null, outcome: 'dontKnow', explanation: null }),
    question({
      position: 3,
      chosenIndex: null,
      outcome: 'incorrect',
      explanation: { text: 'Говорят «make a decision».', lang: 'ru' },
    }),
  ],
};

function renderReview(review = REVIEW) {
  render(
    <NextIntlClientProvider locale="ru" messages={ru}>
      <DiagnosticReview review={review} />
    </NextIntlClientProvider>,
  );
  return screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-review-question'));
}

const marks = (card: HTMLElement) =>
  within(card)
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('DiagnosticReview', () => {
  it('one card per question in an ordered list, numbered from 1, with its axis', () => {
    const cards = renderReview();
    expect(screen.getByRole('heading', { level: 1, name: 'Разбор ответов' })).toBeTruthy();
    expect(cards).toHaveLength(4);
    expect(cards[0]?.closest('ol')).toBeTruthy();
    expect(cards[0]).toHaveAccessibleName('Вопрос 1 · Грамматика');
    expect(cards[1]).toHaveAccessibleName('Вопрос 2 · Словарь');
  });

  it('a verdict in words on every card, never a total', () => {
    const cards = renderReview();
    expect(cards.map((c) => c.getAttribute('data-outcome'))).toEqual([
      'correct',
      'incorrect',
      'dontKnow',
      'incorrect',
    ]);
    expect(within(cards[0] as HTMLElement).getByText('Верно')).toBeTruthy();
    expect(within(cards[1] as HTMLElement).getByText('Неверно')).toBeTruthy();
    expect(within(cards[2] as HTMLElement).getByText('Вы ответили «Не знаю»')).toBeTruthy();
    // No "X из N", no score anywhere.
    expect(document.body.textContent).not.toMatch(/\d+\s*(из|\/)\s*\d+|%/);
  });

  it('marks the answer and the key in words, not by colour alone', () => {
    const [right, wrong, dontKnow] = renderReview();
    expect(marks(right as HTMLElement)).toEqual([
      'did',
      'took',
      'madeВаш ответПравильный ответ',
      'got',
    ]);
    expect(marks(wrong as HTMLElement)).toEqual([
      'didВаш ответ',
      'took',
      'madeПравильный ответ',
      'got',
    ]);
    // "I don't know": the key only, no "your answer".
    expect(marks(dontKnow as HTMLElement)).toEqual(['did', 'took', 'madeПравильный ответ', 'got']);
    // Icons are decoration; the words carry the meaning.
    for (const svg of document.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('the question and options are English; the explanation says its own language', () => {
    const cards = renderReview();
    const card = cards[0] as HTMLElement;
    expect(within(card).getByText(/^She/).getAttribute('lang')).toBe('en');
    expect(within(card).getByText('We make a decision.').getAttribute('lang')).toBe('en');
    expect(
      within(cards[3] as HTMLElement)
        .getByText('Говорят «make a decision».')
        .getAttribute('lang'),
    ).toBe('ru');
    expect(cards[2]?.querySelector('[data-why]')).toBeNull();
  });

  it('a stored answer that is gone from the options is said so', () => {
    const cards = renderReview();
    expect(within(cards[3] as HTMLElement).getByText(/изменился после теста/)).toBeTruthy();
    expect(within(cards[2] as HTMLElement).queryByText(/изменился после теста/)).toBeNull();
    expect(within(cards[1] as HTMLElement).queryByText(/изменился после теста/)).toBeNull();
  });

  it('leads on to practice, and back to the result without prefetching it', () => {
    renderReview();
    const practice = screen.getByRole('link', { name: 'К практике' });
    expect(practice.getAttribute('href')).toBe('/exercises');
    const back = screen.getByRole('link', { name: 'К результату' });
    expect(back.getAttribute('href')).toBe('/diagnostic');
    expect(back.getAttribute('data-prefetch')).toBe('false');
  });
});
