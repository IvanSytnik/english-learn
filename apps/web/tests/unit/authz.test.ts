import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fn with it.
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ auth }));

const { authorizeAction, requireRole } = await import('@/lib/authz');

const session = (role: 'STUDENT' | 'TUTOR' | 'ADMIN') => ({
  user: { id: 'u1', role, email: 'u1@example.com' },
  expires: '2099-01-01T00:00:00.000Z',
});

// notFound() throws a control-flow error tagged with this digest.
const NOT_FOUND = { digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) };

describe('requireRole', () => {
  beforeEach(() => {
    auth.mockReset();
  });

  it('404s without a session', async () => {
    auth.mockResolvedValue(null);
    await expect(requireRole('ADMIN')).rejects.toMatchObject(NOT_FOUND);
  });

  it('404s for a wrong role', async () => {
    auth.mockResolvedValue(session('STUDENT'));
    await expect(requireRole('ADMIN')).rejects.toMatchObject(NOT_FOUND);
  });

  it('returns the user for an allowed role', async () => {
    auth.mockResolvedValue(session('TUTOR'));
    await expect(requireRole('TUTOR', 'ADMIN')).resolves.toMatchObject({ id: 'u1', role: 'TUTOR' });
  });
});

describe('authorizeAction', () => {
  beforeEach(() => {
    auth.mockReset();
  });

  it('returns UNAUTHENTICATED without a session', async () => {
    auth.mockResolvedValue(null);
    await expect(authorizeAction('ADMIN')).resolves.toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
    });
  });

  it('returns UNAUTHENTICATED instead of throwing when auth() fails', async () => {
    auth.mockRejectedValue(new Error('JWTSessionError'));
    await expect(authorizeAction('ADMIN')).resolves.toEqual({
      ok: false,
      error: 'UNAUTHENTICATED',
    });
  });

  it('returns FORBIDDEN for a wrong role', async () => {
    auth.mockResolvedValue(session('STUDENT'));
    await expect(authorizeAction('ADMIN')).resolves.toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('returns the user for an allowed role', async () => {
    auth.mockResolvedValue(session('ADMIN'));
    await expect(authorizeAction('ADMIN')).resolves.toMatchObject({
      ok: true,
      value: { id: 'u1', role: 'ADMIN' },
    });
  });
});
