import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, redirect, loadNextExercise } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((_: { href: string; locale: string }) => {
    throw new Error('NEXT_REDIRECT');
  }),
  loadNextExercise: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: {} }));
vi.mock('@/app/[locale]/(student)/exercises/exercise-player', () => ({
  ExercisePlayer: () => null,
}));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/i18n/navigation', () => ({ redirect, Link: () => null }));
vi.mock('@/lib/exercise/load', () => ({ loadNextExercise }));
vi.mock('@/lib/diagnostic', () => ({ isDiagnosticDone: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));

const { default: ExercisesPage } = await import('@/app/[locale]/(student)/exercises/page');

const visit = () => ExercisesPage({ searchParams: Promise.resolve({ minutes: '10' }) });

beforeEach(() => {
  vi.clearAllMocks();
  loadNextExercise.mockResolvedValue(null);
});

describe('/exercises', () => {
  it('sends a signed-out visitor to /login', async () => {
    auth.mockResolvedValue(null);
    await expect(visit()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/login', locale: 'en' });
  });

  it.each([
    'TUTOR',
    'ADMIN',
  ])('sends a %s to /dashboard without selecting an exercise', async (role) => {
    auth.mockResolvedValue({ user: { id: 'u1', role } });
    await expect(visit()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/dashboard', locale: 'en' });
    expect(loadNextExercise).not.toHaveBeenCalled();
  });

  it('lets a student practise', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', role: 'STUDENT' } });
    await visit();
    expect(redirect).not.toHaveBeenCalled();
    expect(loadNextExercise).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1' }));
  });
});
