import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above plain declarations — hoist the mock fns with it.
const { findUnique, create, signIn, redirectAfterAuth, KnownRequestError } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  signIn: vi.fn(),
  redirectAfterAuth: vi.fn(),
  KnownRequestError: class extends Error {
    code = '';
  },
}));
vi.mock('@englishlearn/db', () => ({
  prisma: { user: { findUnique, create } },
  Prisma: { PrismaClientKnownRequestError: KnownRequestError },
}));
vi.mock('@/lib/auth', () => ({ signIn }));
vi.mock('@/lib/auth-redirect', () => ({ redirectAfterAuth }));

const { registerUser } = await import('@/app/[locale]/(auth)/register/actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { name: 'Ada', email: 'ada@example.com', password: 'correct-horse' };

describe('registerUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a STUDENT with an empty profile in the same insert', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'user_1' });

    await registerUser(null, form(valid));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: valid.email,
        role: 'STUDENT',
        profile: { create: {} },
      }),
    });
    expect(redirectAfterAuth).toHaveBeenCalledTimes(1);
  });

  it('returns EMAIL_TAKEN and never creates when the email is in use', async () => {
    findUnique.mockResolvedValue({ id: 'existing' });

    const result = await registerUser(null, form(valid));

    expect(result).toMatchObject({ ok: false, error: 'EMAIL_TAKEN' });
    expect(create).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
