import 'server-only';
import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { localeCookieName } from '../i18n/config';
import { redirect } from '../i18n/navigation';
import { resolvePostAuthRedirect } from './post-auth-redirect';

/** Ends a sign-in/sign-up server action with a locale-preserving redirect. */
export async function redirectAfterAuth(callbackUrl: unknown): Promise<never> {
  const target = resolvePostAuthRedirect(callbackUrl, await getLocale());
  // A server-action redirect is rendered through an internal fetch that
  // carries this cookie; if it disagreed with the target locale, next-intl
  // would redirect that fetch and the page would render in the wrong language.
  (await cookies()).set(localeCookieName, target.locale, { path: '/', sameSite: 'lax' });
  return redirect({ href: target.href, locale: target.locale });
}
