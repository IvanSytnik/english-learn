import { beforeEach, describe, expect, it, vi } from 'vitest';
import { csvCell, toFeedbackCsv } from '@/lib/feedback-csv';

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

const { exportFeedbackCsvAction } = await import('@/app/[locale]/admin/feedback/actions');

const row = (over: Partial<Parameters<typeof toFeedbackCsv>[0][number]> = {}) => ({
  id: 'fb-1',
  kind: 'BUG' as const,
  text: 'Button does nothing',
  url: '/ru/exercises',
  itemId: null,
  conceptId: null,
  createdAt: new Date('2026-10-28T09:30:00Z'),
  user: { email: 'learner@example.com', name: 'Olena' },
  ...over,
});

const asRole = (role: 'STUDENT' | 'TUTOR' | 'ADMIN') =>
  auth.mockResolvedValue({ user: { id: 'u1', role, email: 'u1@example.com' } });

beforeEach(() => {
  vi.clearAllMocks();
  getBetaFeedbacks.mockResolvedValue([row()]);
});

describe('csvCell', () => {
  it.each([
    '=HYPERLINK("http://x","y")',
    '+1+1',
    '-2+3',
    '@SUM(A1)',
    '\tcmd',
    '\rcmd',
  ])('defuses a formula: %j', (value) => {
    expect(csvCell(value).startsWith(`"'`)).toBe(true);
  });

  it('quotes every field and doubles inner quotes; commas and newlines stay inside', () => {
    expect(csvCell('say "hi", then\nleave')).toBe('"say ""hi"", then\nleave"');
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell(null)).toBe('""');
  });

  it('leaves a formula character in the middle alone', () => {
    expect(csvCell('a=b')).toBe('"a=b"');
  });
});

describe('toFeedbackCsv', () => {
  it('a BOM, a header, one CRLF row per report, ISO UTC times', () => {
    const csv = toFeedbackCsv([row(), row({ id: 'fb-2', user: { email: 'b@x.dev', name: null } })]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(4); // header + 2 rows + trailing empty
    expect(lines[0]).toBe('"createdAt","email","name","kind","text","url","itemId","conceptId"');
    expect(lines[1]).toBe(
      '"2026-10-28T09:30:00.000Z","learner@example.com","Olena","BUG","Button does nothing","/ru/exercises","",""',
    );
    expect(lines[3]).toBe('');
  });

  it('defuses formulas in what learners typed', () => {
    const csv = toFeedbackCsv([row({ text: '=cmd|"/c calc"!A1', url: '@evil' })]);
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`);
    expect(csv).toContain(`"'@evil"`);
  });
});

describe('exportFeedbackCsvAction', () => {
  it.each([
    'STUDENT',
    'TUTOR',
  ] as const)('FORBIDDEN for a %s, without reading feedback', async (role) => {
    asRole(role);
    expect(await exportFeedbackCsvAction({ sort: 'newest' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(getBetaFeedbacks).not.toHaveBeenCalled();
  });

  it('UNAUTHENTICATED without a session', async () => {
    auth.mockResolvedValue(null);
    expect(await exportFeedbackCsvAction({ sort: 'newest' })).toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
    });
    expect(getBetaFeedbacks).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { sort: 'url' }, 'newest'])('rejects input %j', async (input) => {
    asRole('ADMIN');
    expect(await exportFeedbackCsvAction(input)).toEqual({ ok: false, error: 'VALIDATION_ERROR' });
    expect(getBetaFeedbacks).not.toHaveBeenCalled();
  });

  it('exports up to 500 reports in the requested order, as a dated .csv', async () => {
    asRole('ADMIN');
    const res = await exportFeedbackCsvAction({ sort: 'page' });
    expect(getBetaFeedbacks).toHaveBeenCalledWith({ tag: 'prisma' }, { limit: 500, sort: 'page' });
    expect(res.ok && res.value.fileName).toMatch(/^beta-feedback-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(res.ok && res.value.csv).toContain('"learner@example.com"');
  });

  it('INTERNAL_ERROR when the query fails', async () => {
    asRole('ADMIN');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getBetaFeedbacks.mockRejectedValue(new Error('db down'));
    expect(await exportFeedbackCsvAction({ sort: 'newest' })).toEqual({
      ok: false,
      error: 'INTERNAL_ERROR',
    });
  });
});
