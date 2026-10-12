import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireRole } from '@/lib/authz';

// First section in the admin nav.
export default async function AdminContentIndexPage() {
  await requireRole('ADMIN');
  return redirect({ href: '/admin/content/vocab', locale: await getLocale() });
}
