import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { DashboardConcept, StudentDashboard } from '@/lib/dashboard';
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

const { ConceptList } = await import('@/app/[locale]/(student)/dashboard/concept-list');

// jsdom has HTMLDialogElement but no modal behaviour: the minimum the sheet
// relies on (open state, the close event). Esc itself is the browser's — e2e.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

const concept = (over: Partial<DashboardConcept>): DashboardConcept => ({
  id: 'g.base',
  title: 'Past Simple',
  category: 'GRAMMAR',
  cefrLevel: 'A2',
  stage: 'DEVELOPING',
  isFading: false,
  isLocked: false,
  lockedBy: [],
  isRecommendedStart: false,
  practicedItemCount: 2,
  itemCount: 5,
  lastPracticedAt: '2026-10-20T09:30:00.000Z',
  requires: [],
  unlocks: [],
  ...over,
});

const sections = (...concepts: DashboardConcept[]): StudentDashboard['sections'] => [
  { category: 'GRAMMAR', concepts },
];

function renderList(list: StudentDashboard['sections'], diagnosticDone = true) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ru} timeZone="UTC">
      <ConceptList sections={list} diagnosticDone={diagnosticDone} />
    </NextIntlClientProvider>,
  );
}

const dialog = () => document.querySelector('dialog') as HTMLDialogElement;
const openTopic = (title: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));

describe('ConceptSheet', () => {
  it('a topic opens the sheet with its details; the close button closes it', () => {
    renderList(
      sections(
        concept({
          requires: [{ id: 'g.be', title: 'To be' }],
          unlocks: [
            { id: 'g.pp', title: 'Present Perfect' },
            { id: 'g.pc', title: 'Past Continuous' },
          ],
        }),
      ),
    );
    expect(dialog().open).toBe(false);
    openTopic('Past Simple');
    expect(dialog().open).toBe(true);
    const sheet = within(dialog());
    expect(sheet.getByRole('heading', { name: 'Past Simple' })).toBeInTheDocument();
    expect(dialog()).toHaveTextContent('Грамматика · A2');
    expect(sheet.getByText('В процессе')).toBeInTheDocument();
    expect(sheet.getByText('Отработано 2 из 5 упражнений темы')).toBeInTheDocument();
    expect(sheet.getByText('Последняя практика: 20 окт. 2026 г.')).toBeInTheDocument();
    expect(sheet.getByText('Требуется: «To be»')).toBeInTheDocument();
    expect(sheet.getByText('Открывает: «Present Perfect» и «Past Continuous»')).toBeInTheDocument();

    fireEvent.click(sheet.getByRole('button', { name: 'Закрыть' }));
    expect(dialog().open).toBe(false);
    expect(dialog()).toBeEmptyDOMElement();
  });

  it('a click on the backdrop closes it, a click inside does not', () => {
    renderList(sections(concept({})));
    openTopic('Past Simple');
    fireEvent.click(within(dialog()).getByRole('heading', { name: 'Past Simple' }));
    expect(dialog().open).toBe(true);
    fireEvent.click(dialog());
    expect(dialog().open).toBe(false);
  });

  it('an untouched topic: never practised, 0 of N, no empty link lists', () => {
    renderList(
      sections(concept({ stage: 'NOT_STARTED', practicedItemCount: 0, lastPracticedAt: null })),
    );
    openTopic('Past Simple');
    const sheet = within(dialog());
    expect(sheet.getByText('Ещё не практиковалась')).toBeInTheDocument();
    expect(sheet.getByText('Отработано 0 из 5 упражнений темы')).toBeInTheDocument();
    expect(dialog().querySelector('[data-sheet-requires]')).toBeNull();
    expect(dialog().querySelector('[data-sheet-unlocks]')).toBeNull();
  });

  it('a locked topic says what opens it instead of a stage', () => {
    renderList(
      sections(
        concept({
          stage: 'NOT_STARTED',
          isLocked: true,
          lockedBy: [{ id: 'g.be', title: 'To be' }],
        }),
        concept({ id: 'g.ghost', title: 'Orphan', stage: 'NOT_STARTED', isLocked: true }),
      ),
    );
    openTopic('Past Simple');
    expect(within(dialog()).getByText('Откроется после темы «To be»')).toBeInTheDocument();
    expect(dialog().querySelector('[data-stage]')).toBeNull();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Закрыть' }));
    openTopic('Orphan');
    expect(
      within(dialog()).getByText('Откроется по мере прохождения предыдущих тем'),
    ).toBeInTheDocument();
  });

  it('due for review shows the badge next to the stage', () => {
    renderList(sections(concept({ isFading: true })));
    openTopic('Past Simple');
    expect(within(dialog()).getByText('Пора повторить')).toBeInTheDocument();
  });

  it('CTA: practice after the diagnostic, the level (never prefetched) before it', () => {
    const { unmount } = renderList(sections(concept({})), true);
    openTopic('Past Simple');
    expect(within(dialog()).getByRole('link', { name: 'Продолжить практику' })).toHaveAttribute(
      'href',
      '/exercises',
    );
    unmount();

    renderList(sections(concept({})), false);
    openTopic('Past Simple');
    const cta = within(dialog()).getByRole('link', { name: 'Определить уровень' });
    expect(cta).toHaveAttribute('href', '/diagnostic');
    expect(cta).toHaveAttribute('data-prefetch', 'false');
  });

  it('the sheet is labelled by the topic title', () => {
    renderList(sections(concept({})));
    openTopic('Past Simple');
    expect(screen.getByRole('dialog', { name: 'Past Simple' })).toBe(dialog());
  });
});
