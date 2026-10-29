import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((_: { href: string; locale: string }) => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/i18n/navigation', () => ({ redirect }));
vi.mock('next-intl/server', () => ({ getLocale: async () => 'en' }));
vi.mock('@/app/[locale]/(student)/words/practice/vocab-player', () => ({
  VocabPlayer: () => null,
}));

const { default: WordsPracticePage } = await import('@/app/[locale]/(student)/words/practice/page');

const open = (searchParams: Record<string, string | string[] | undefined> = {}) =>
  WordsPracticePage({ searchParams: Promise.resolve(searchParams) });

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT' } });
});

describe('/words/practice page', () => {
  it('sends a signed-out visitor to /login', async () => {
    auth.mockResolvedValue(null);
    await expect(open()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/login', locale: 'en' });
  });

  it.each(['TUTOR', 'ADMIN'])('sends a %s to the dashboard', async (role) => {
    auth.mockResolvedValue({ user: { id: 'user-1', role } });
    await expect(open()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/dashboard', locale: 'en' });
  });

  it('narrows the session to a real topic concept', async () => {
    const page = await open({ concept: 'vocab.travel.a2' });
    expect(page.props).toEqual({ conceptId: 'vocab.travel.a2' });
  });

  it.each([
    ['no concept', {}],
    ['an unknown concept', { concept: 'vocab.nowhere.a2' }],
    ['a grammar concept', { concept: 'grammar.past_simple' }],
    ['a repeated parameter', { concept: ['vocab.travel.a1', 'vocab.travel.a2'] }],
  ])('%s is the whole pool', async (_, searchParams) => {
    const page = await open(searchParams);
    expect(page.props).toEqual({ conceptId: undefined });
  });
});
