'use server';

import { prisma } from '@englishlearn/db';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { after } from 'next/server';
import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { createPasswordResetToken, passwordResetUrl } from '@/lib/auth/password-reset';
import { clientIp, emailSubject, withinAuthLimits } from '@/lib/auth/rate-limit';
import { sendPasswordResetEmail } from '@/lib/email/mailer';
import type { Result } from '@/lib/result';

const forgotSchema = z.object({ email: z.string().trim().email().max(254) });

export type ForgotPasswordError = 'INVALID_EMAIL' | 'RATE_LIMITED' | 'FAILED';
export type ForgotPasswordResult = Result<{ success: true }, ForgotPasswordError>;

async function sendResetIfUserExists(email: string, locale: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { email: true } });
    if (!user) return;
    const token = await createPasswordResetToken(prisma, user.email);
    await sendPasswordResetEmail({
      to: user.email,
      url: passwordResetUrl(locale, user.email, token),
      locale,
    });
  } catch (err) {
    console.error('password reset request failed', err);
  }
}

/**
 * Start a password reset. The answer is the same whether or not the email
 * has an account — and so is its timing: the lookup, token and email all run
 * in `after()`, once the response is sent.
 */
export async function requestPasswordResetAction(input: {
  email: unknown;
}): Promise<ForgotPasswordResult> {
  const parsed = forgotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_EMAIL' };
  const { email } = parsed.data;

  try {
    const allowed = await withinAuthLimits([
      ['forgot:ip', clientIp(await headers())],
      ['forgot:email', emailSubject(email)],
    ]);
    if (!allowed) return { ok: false, error: 'RATE_LIMITED' };

    const locale = await getLocale();
    after(() => sendResetIfUserExists(email, locale));
  } catch (err) {
    unstable_rethrow(err);
    console.error('requestPasswordResetAction failed', err);
    return { ok: false, error: 'FAILED' };
  }
  return { ok: true, value: { success: true } };
}
