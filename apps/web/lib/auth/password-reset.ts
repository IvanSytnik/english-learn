import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient } from '@englishlearn/db';
import { defaultLocale } from '@/i18n/config';
import { env } from '@/lib/env';

/** Reset links live one hour. */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** The raw token is 32 random bytes as hex — what the link carries. */
export const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

type TokenDb = Pick<PrismaClient, 'verificationToken'>;

const identifierFor = (email: string) => `reset:${email}`;
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

/** `<APP_URL>[/<locale>]/reset-password?token=…&email=…` (default locale unprefixed). */
export function passwordResetUrl(locale: string, email: string, token: string): string {
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  const url = new URL(`${prefix}/reset-password`, env.APP_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('email', email);
  return url.toString();
}

/** Drop every reset token for `email` — when the account goes, its links must die with it. */
export function deletePasswordResetTokens(db: TokenDb, email: string) {
  return db.verificationToken.deleteMany({ where: { identifier: identifierFor(email) } });
}

/**
 * Issue a fresh reset token for `email` (the address as stored on the user).
 * Only its SHA-256 is stored, so a leaked table cannot be replayed; any earlier
 * reset token for the address is dropped in the same transaction.
 */
export async function createPasswordResetToken(
  db: TokenDb & Pick<PrismaClient, '$transaction'>,
  email: string,
  now = new Date(),
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const identifier = identifierFor(email);
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier } }),
    db.verificationToken.create({
      data: {
        identifier,
        token: sha256(token),
        expires: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      },
    }),
  ]);
  return token;
}

/**
 * True when `token` is the live reset token for `email`. The row is deleted
 * by the lookup itself, so a token works once even under concurrent requests
 * (only one DELETE finds the row) — and an expired one is cleaned up on the
 * way out. Pass a transaction client to roll the consumption back with the
 * password update.
 */
export async function verifyAndConsumePasswordResetToken(
  db: TokenDb,
  { email, token }: { email: string; token: string },
  now = new Date(),
): Promise<boolean> {
  if (!RESET_TOKEN_PATTERN.test(token)) return false;
  try {
    const row = await db.verificationToken.delete({
      where: { identifier_token: { identifier: identifierFor(email), token: sha256(token) } },
    });
    return row.expires.getTime() > now.getTime();
  } catch (err) {
    // P2025: no such row — unknown, already used, or replaced by a newer token.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return false;
    throw err;
  }
}
