import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireRole } from '@/lib/authz';

// Guard before redirecting: guests and non-admins must get the same 404 as any other admin URL.
export default async function AdminIndexPage() {
  await requireRole('ADMIN');
  return redirect({ href: '/admin/users', locale: await getLocale() });
}
