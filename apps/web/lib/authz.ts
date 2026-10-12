import 'server-only';
import { notFound, unstable_rethrow } from 'next/navigation';
import type { Session } from 'next-auth';
import { auth } from './auth';
import type { Result } from './result';

export type SessionUser = Session['user'];
export type Role = SessionUser['role'];
export type AuthzError = 'UNAUTHENTICATED' | 'FORBIDDEN';

/**
 * Guard for layouts and pages. A missing session and a wrong role both 404,
 * so the existence of protected routes is not revealed.
 */
export async function requireRole(...roles: [Role, ...Role[]]): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user || !roles.includes(user.role)) notFound();
  return user;
}

/**
 * Guard for server actions. Layouts and the proxy do not protect actions, so
 * every action under admin/ or tutor/ must call this itself. Never throws
 * (apart from Next.js control-flow errors) and never calls notFound().
 */
export async function authorizeAction(
  ...roles: [Role, ...Role[]]
): Promise<Result<SessionUser, AuthzError>> {
  let session: Session | null;
  try {
    session = await auth();
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const user = session?.user;
  if (!user) return { ok: false, error: 'UNAUTHENTICATED' };
  if (!roles.includes(user.role)) return { ok: false, error: 'FORBIDDEN' };
  return { ok: true, value: user };
}
