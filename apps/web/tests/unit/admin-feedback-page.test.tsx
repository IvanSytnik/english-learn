import { render, screen, within } from '@testing-library/react';
import { createFormatter, createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';

const { auth, getBetaFeedbacks } = vi.hoisted(() => ({
  auth: vi.fn(),
  getBetaFeedbacks: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/feedback', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@englishlearn/db/queries/feedback')>()),
  getBetaFeedbacks,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'en', messages: en, namespace: namespace as never }),
  getFormatter: async () => createFormatter({ locale: 'en', timeZone: 'UTC' }),
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: { pathname: string; query: Record<string, string> };
    children: ReactNode;
  }) => (
    <a href={`${href.pathname}?${new URLSearchParams(href.query)}`} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/app/[locale]/admin/feedback/export-feedback', () => ({
  ExportFeedback: ({ sort }: { sort: string }) => <div data-export-sort={sort} />,
}));

const { default: Page } = await import('@/app/[locale]/admin/feedback/page');
const FeedbackAdminPage = (sort?: string | string[]) =>
  Page({ searchParams: Promise.resolve(sort === undefined ? {} : { sort }) });

// notFound() throws a control-flow error tagged with this digest.
const NOT_FOUND = { digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) };

const asRole = (role: 'STUDENT' | 'TUTOR' | 'ADMIN') =>
  auth.mockResolvedValue({ user: { id: 'u1', role, email: 'u1@example.com' } });

const rows = [
  {
    id: 'fb-2',
    kind: 'CONTENT_ERROR',
    text: 'Two options are correct\nin this one',
    url: '/en/exercises?minutes=10',
    itemId: 'item.vocab.travel.luggage',
    conceptId: 'vocab.travel',
    createdAt: new Date('2026-10-28T09:30:00Z'),
    user: { email: 'learner@example.com', name: 'Olena' },
  },
  {
    id: 'fb-1',
    kind: 'BUG',
    text: '<img src=x onerror=alert(1)>',
    url: 'javascript:alert(1)',
    itemId: null,
    conceptId: null,
    createdAt: new Date('2026-10-27T18:00:00Z'),
    user: { email: 'other@example.com', name: null },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  getBetaFeedbacks.mockResolvedValue(rows);
});

describe('/admin/feedback', () => {
  it.each([
    'STUDENT',
    'TUTOR',
  ] as const)('404s for a %s, without reading feedback', async (role) => {
    asRole(role);
    await expect(FeedbackAdminPage()).rejects.toMatchObject(NOT_FOUND);
    expect(getBetaFeedbacks).not.toHaveBeenCalled();
  });

  it('404s without a session, without reading feedback', async () => {
    auth.mockResolvedValue(null);
    await expect(FeedbackAdminPage()).rejects.toMatchObject(NOT_FOUND);
    expect(getBetaFeedbacks).not.toHaveBeenCalled();
  });

  it('lists the reports in the order the query returns (newest first), with every field', async () => {
    asRole('ADMIN');
    render(await FeedbackAdminPage());

    expect(getBetaFeedbacks).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { limit: 200, sort: 'newest' },
    );
    expect(screen.getByRole('heading', { name: en.admin.feedback.title })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole('row').slice(1);
    expect(first).toHaveAttribute('data-feedback-row', 'fb-2');
    expect(second).toHaveAttribute('data-feedback-row', 'fb-1');

    const row = within(first as HTMLElement);
    expect(row.getByText('learner@example.com')).toBeInTheDocument();
    expect(row.getByText('Olena')).toBeInTheDocument();
    expect(row.getByText(en.feedback.kinds.contentError)).toBeInTheDocument();
    expect(row.getByText(/Two options are correct/)).toBeInTheDocument();
    expect(row.getByText('/en/exercises?minutes=10')).toBeInTheDocument();
    expect(row.getByText('item.vocab.travel.luggage')).toBeInTheDocument();
    expect(row.getByText('vocab.travel')).toBeInTheDocument();
    expect(row.getByText('Oct 28, 2026, 9:30 AM')).toHaveAttribute(
      'datetime',
      '2026-10-28T09:30:00.000Z',
    );
    expect(within(second as HTMLElement).getByText(en.feedback.kinds.bug)).toBeInTheDocument();
  });

  it('shows what reporters typed as text: no markup, no links', async () => {
    asRole('ADMIN');
    const { container } = render(await FeedbackAdminPage());
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('table a')).toBeNull();
    expect(screen.getByText('javascript:alert(1)').tagName).toBe('TD');
  });

  it('says so when there is no feedback yet', async () => {
    asRole('ADMIN');
    getBetaFeedbacks.mockResolvedValue([]);
    render(await FeedbackAdminPage());
    expect(screen.getByText(en.admin.feedback.empty)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it.each([
    'oldest',
    'page',
  ] as const)('?sort=%s orders the query and the export the same way', async (sort) => {
    asRole('ADMIN');
    const { container } = render(await FeedbackAdminPage(sort));
    expect(getBetaFeedbacks).toHaveBeenCalledWith({ tag: 'prisma' }, { limit: 200, sort });
    const nav = screen.getByRole('navigation', { name: en.admin.feedback.sort.label });
    expect(within(nav).getByText(en.admin.feedback.sort[sort])).toHaveAttribute(
      'aria-current',
      'true',
    );
    const others = (['newest', 'oldest', 'page'] as const).filter((o) => o !== sort);
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(others.map((o) => `/admin/feedback?sort=${o}`));
    expect(container.querySelector('[data-export-sort]')).toHaveAttribute('data-export-sort', sort);
  });

  it.each([
    ['bogus'],
    [['page', 'oldest']],
    [''],
  ])('an unknown sort %j falls back to newest', async (sort) => {
    asRole('ADMIN');
    render(await FeedbackAdminPage(sort));
    expect(getBetaFeedbacks).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { limit: 200, sort: 'newest' },
    );
  });

  it('offers no export when there is nothing to export', async () => {
    asRole('ADMIN');
    getBetaFeedbacks.mockResolvedValue([]);
    const { container } = render(await FeedbackAdminPage());
    expect(container.querySelector('[data-export-sort]')).toBeNull();
  });
});
