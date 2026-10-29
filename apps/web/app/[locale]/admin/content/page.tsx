import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { requireRole } from '@/lib/authz';

// No content section has a UI yet; land on the beta feedback queue.
export default async function AdminContentIndexPage() {
  await requireRole('ADMIN');
  return redirect({ href: '/admin/feedback', locale: await getLocale() });
}
