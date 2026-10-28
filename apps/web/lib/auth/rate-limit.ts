import 'server-only';
import { prisma } from '@englishlearn/db';
import { consumeRateLimit } from '@englishlearn/db/queries/rate-limit';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Hits per window for each throttled auth action. */
export const AUTH_LIMITS = {
  'login:ip': { limit: 10, windowMs: MINUTE },
  'login:email': { limit: 5, windowMs: 15 * MINUTE },
  'register:ip': { limit: 5, windowMs: HOUR },
  'forgot:ip': { limit: 10, windowMs: HOUR },
  'forgot:email': { limit: 3, windowMs: HOUR },
} as const;

export type AuthLimitName = keyof typeof AUTH_LIMITS;

/**
 * The caller's IP. On Vercel `x-forwarded-for` is set by the edge (a client
 * value is overwritten), so its first entry is trustworthy there; elsewhere
 * it is only as good as the proxy in front.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Emails are throttled case-insensitively, so `Ada@x` and `ada@x` share a budget. */
export const emailSubject = (email: string) => email.trim().toLowerCase();

/**
 * Count one hit against every given limit; false when any is exhausted. All
 * are consumed even when one is already over, so a blocked IP cannot probe
 * an email's budget for free.
 */
export async function withinAuthLimits(
  checks: ReadonlyArray<readonly [AuthLimitName, string]>,
): Promise<boolean> {
  const results = await Promise.all(
    checks.map(([name, subject]) =>
      consumeRateLimit(prisma, { key: `${name}:${subject}`, ...AUTH_LIMITS[name] }),
    ),
  );
  return results.every((r) => r.allowed);
}
