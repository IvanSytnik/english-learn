import { beforeEach, describe, expect, it, vi } from 'vitest';

const { auth, createBetaFeedback } = vi.hoisted(() => ({
  auth: vi.fn(),
  createBetaFeedback: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/feedback', () => ({ createBetaFeedback }));
vi.mock('@/lib/auth', () => ({ auth }));

const { submitBetaFeedbackAction } = await import('@/app/[locale]/(student)/actions/feedback');

const valid = { text: 'The answer key is wrong', url: '/en/exercises', itemId: 'item-1' };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT' } });
  createBetaFeedback.mockResolvedValue({ id: 'fb-1' });
});

describe('submitBetaFeedbackAction', () => {
  it('rejects a signed-out user without touching the database', async () => {
    auth.mockResolvedValue(null);
    expect(await submitBetaFeedbackAction(valid)).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('rejects text shorter than 5 characters after trimming', async () => {
    expect(await submitBetaFeedbackAction({ ...valid, text: '  abcd  ' })).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('rejects text longer than 1000 characters', async () => {
    expect(await submitBetaFeedbackAction({ ...valid, text: 'a'.repeat(1001) })).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
    expect(createBetaFeedback).not.toHaveBeenCalled();
  });

  it('rejects input that is not an object', async () => {
    expect(await submitBetaFeedbackAction('hello world')).toEqual({
      ok: false,
      error: 'VALIDATION_ERROR',
    });
  });

  it("stores the report as the session's user, whatever userId the input claims", async () => {
    const result = await submitBetaFeedbackAction({ ...valid, userId: 'someone-else' });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(createBetaFeedback).toHaveBeenCalledTimes(1);
    expect(createBetaFeedback).toHaveBeenCalledWith(
      { tag: 'prisma' },
      { ...valid, kind: 'CONTENT_ERROR', userId: 'user-1' },
    );
  });

  it('logs a database failure and returns only INTERNAL_ERROR to the client', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    createBetaFeedback.mockRejectedValue(new Error('connection to db.secret-host refused'));

    const result = await submitBetaFeedbackAction(valid);

    expect(result).toEqual({ ok: false, error: 'INTERNAL_ERROR' });
    expect(JSON.stringify(result)).not.toContain('secret-host');
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
