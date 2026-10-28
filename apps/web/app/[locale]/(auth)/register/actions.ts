'use server';

import { Prisma, prisma } from '@englishlearn/db';
import { hash } from 'bcryptjs';
import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';
import { signIn } from '@/lib/auth';
import { clientIp, withinAuthLimits } from '@/lib/auth/rate-limit';
import { redirectAfterAuth } from '@/lib/auth-redirect';
import type { Result } from '@/lib/result';
import { HONEYPOT_FIELD } from './honeypot';

// Issue messages are error codes, localized by the form (auth.register.errors.<field>.<code>).
const registerSchema = z.object({
  name: z.string({ error: 'REQUIRED' }).min(1, 'REQUIRED').max(80, 'TOO_LONG'),
  email: z.string({ error: 'REQUIRED' }).email('INVALID'),
  password: z.string({ error: 'REQUIRED' }).min(8, 'TOO_SHORT').max(120, 'TOO_LONG'),
});

export type RegisterField = keyof z.input<typeof registerSchema>;
export type RegisterFieldError = 'REQUIRED' | 'INVALID' | 'TOO_SHORT' | 'TOO_LONG';
export type RegisterError = 'VALIDATION' | 'EMAIL_TAKEN' | 'RATE_LIMITED' | 'AUTH_FAILED';
export type RegisterState =
  | (Result<never, RegisterError> & {
      fieldErrors?: Partial<Record<RegisterField, RegisterFieldError>>;
      // Echoed back so the form keeps them; the password never is.
      values: { name: string; email: string };
    })
  | null;

export async function registerUser(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  // A bot gets what a sign-up looks like — the redirect — and nothing is written.
  if (formData.get(HONEYPOT_FIELD)) return redirectAfterAuth(formData.get('callbackUrl'));

  const raw = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  };
  const values = {
    name: typeof raw.name === 'string' ? raw.name : '',
    email: typeof raw.email === 'string' ? raw.email : '',
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<RegisterField, RegisterFieldError>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as RegisterField;
      fieldErrors[field] ??= issue.message as RegisterFieldError;
    }
    return { ok: false, error: 'VALIDATION', fieldErrors, values };
  }
  const { name, email, password } = parsed.data;

  try {
    // Counted before the lookup, so EMAIL_TAKEN cannot be probed past the limit.
    if (!(await withinAuthLimits([['register:ip', clientIp(await headers())]]))) {
      return { ok: false, error: 'RATE_LIMITED', values };
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { ok: false, error: 'EMAIL_TAKEN', values };
    }

    const passwordHash = await hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        // Explicit so a future tutor sign-up cannot inherit a student profile by default.
        role: 'STUDENT',
        profile: { create: {} },
      },
    });

    await signIn('credentials', { email, password, redirect: false });
  } catch (err) {
    unstable_rethrow(err);
    // Lost a race with a concurrent sign-up for the same email.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { ok: false, error: 'EMAIL_TAKEN', values };
    }
    console.error('registerUser failed', err);
    return { ok: false, error: 'AUTH_FAILED', values };
  }
  return redirectAfterAuth(formData.get('callbackUrl'));
}
