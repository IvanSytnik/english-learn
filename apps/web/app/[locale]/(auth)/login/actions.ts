'use server';

import { unstable_rethrow } from 'next/navigation';
import { AuthError } from 'next-auth';
import { signIn } from '@/lib/auth';
import { redirectAfterAuth } from '@/lib/auth-redirect';
import type { Result } from '@/lib/result';

// One error for unknown email and wrong password alike (no account enumeration).
export type LoginError = 'INVALID_CREDENTIALS' | 'AUTH_FAILED';
export type LoginState = Result<never, LoginError> | null;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    });
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AuthError) {
      return {
        ok: false,
        error: err.type === 'CredentialsSignin' ? 'INVALID_CREDENTIALS' : 'AUTH_FAILED',
      };
    }
    throw err;
  }
  return redirectAfterAuth(formData.get('callbackUrl'));
}
