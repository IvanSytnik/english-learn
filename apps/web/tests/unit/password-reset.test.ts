import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { KnownRequestError } = vi.hoisted(() => ({
  KnownRequestError: class extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({
  Prisma: { PrismaClientKnownRequestError: KnownRequestError },
}));
vi.mock('@/lib/env', () => ({ env: { APP_URL: 'https://app.example' } }));

const {
  createPasswordResetToken,
  passwordResetUrl,
  PASSWORD_RESET_TTL_MS,
  verifyAndConsumePasswordResetToken,
} = await import('@/lib/auth/password-reset');

type Row = { identifier: string; token: string; expires: Date };

/** In-memory VerificationToken table with Prisma's semantics for the calls used. */
function fakeDb() {
  const rows: Row[] = [];
  const verificationToken = {
    deleteMany: vi.fn(async ({ where }: { where: { identifier: string } }) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]?.identifier === where.identifier) rows.splice(i, 1);
      }
      return { count: before - rows.length };
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      rows.push(data);
      return data;
    }),
    delete: vi.fn(
      async ({ where }: { where: { identifier_token: { identifier: string; token: string } } }) => {
        const { identifier, token } = where.identifier_token;
        const i = rows.findIndex((r) => r.identifier === identifier && r.token === token);
        if (i < 0) throw new KnownRequestError('P2025');
        return rows.splice(i, 1)[0] as Row;
      },
    ),
  };
  const db = {
    verificationToken,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { db: db as never, rows, verificationToken };
}

const NOW = new Date('2026-10-29T12:00:00.000Z');
const EMAIL = 'ada@example.com';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('password reset tokens', () => {
  let store: ReturnType<typeof fakeDb>;
  beforeEach(() => {
    store = fakeDb();
  });

  it('stores only the SHA-256 of a 32-byte hex token, valid for one hour', async () => {
    const token = await createPasswordResetToken(store.db, EMAIL, NOW);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(store.rows).toEqual([
      {
        identifier: `reset:${EMAIL}`,
        token: sha256(token),
        expires: new Date(NOW.getTime() + PASSWORD_RESET_TTL_MS),
      },
    ]);
    expect(PASSWORD_RESET_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('replaces an earlier token for the same email', async () => {
    const first = await createPasswordResetToken(store.db, EMAIL, NOW);
    const second = await createPasswordResetToken(store.db, EMAIL, NOW);

    expect(store.rows).toHaveLength(1);
    expect(
      await verifyAndConsumePasswordResetToken(store.db, { email: EMAIL, token: first }, NOW),
    ).toBe(false);
    expect(
      await verifyAndConsumePasswordResetToken(store.db, { email: EMAIL, token: second }, NOW),
    ).toBe(true);
  });

  it('works exactly once', async () => {
    const token = await createPasswordResetToken(store.db, EMAIL, NOW);
    const use = () => verifyAndConsumePasswordResetToken(store.db, { email: EMAIL, token }, NOW);

    expect(await use()).toBe(true);
    expect(store.rows).toHaveLength(0);
    expect(await use()).toBe(false);
  });

  it('rejects an expired token and deletes it', async () => {
    const token = await createPasswordResetToken(store.db, EMAIL, NOW);
    const expiry = new Date(NOW.getTime() + PASSWORD_RESET_TTL_MS);

    expect(
      await verifyAndConsumePasswordResetToken(store.db, { email: EMAIL, token }, expiry),
    ).toBe(false);
    expect(store.rows).toHaveLength(0);
  });

  it('rejects a token issued for another email', async () => {
    const token = await createPasswordResetToken(store.db, EMAIL, NOW);

    expect(
      await verifyAndConsumePasswordResetToken(store.db, { email: 'eve@example.com', token }, NOW),
    ).toBe(false);
    expect(store.rows).toHaveLength(1);
  });

  it('rejects a malformed token without touching the database', async () => {
    expect(
      await verifyAndConsumePasswordResetToken(store.db, { email: EMAIL, token: 'abc' }, NOW),
    ).toBe(false);
    expect(store.verificationToken.delete).not.toHaveBeenCalled();
  });

  it('rethrows database errors other than a missing row', async () => {
    store.verificationToken.delete.mockRejectedValueOnce(new KnownRequestError('P1001'));
    const token = 'a'.repeat(64);

    await expect(
      verifyAndConsumePasswordResetToken(store.db, { email: EMAIL, token }, NOW),
    ).rejects.toThrow('P1001');
  });
});

describe('passwordResetUrl', () => {
  it('builds the link on APP_URL, prefixing non-default locales', () => {
    const token = 'f'.repeat(64);
    expect(passwordResetUrl('en', 'a+b@example.com', token)).toBe(
      `https://app.example/reset-password?token=${token}&email=a%2Bb%40example.com`,
    );
    expect(passwordResetUrl('uk', EMAIL, token)).toMatch(
      /^https:\/\/app\.example\/uk\/reset-password\?/,
    );
  });
});
