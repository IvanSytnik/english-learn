import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { requireRole } from '@/lib/authz';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole('ADMIN');

  const t = await getTranslations('admin.nav');

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-line bg-surface-2 p-4">
        <div className="mb-6 font-semibold">Admin</div>
        <nav className="flex flex-col gap-2 text-sm">
          <div className="mt-2 text-xs font-semibold uppercase text-ink-muted">{t('content')}</div>
          <Link
            href="/admin/content/vocab"
            className="text-ink-muted hover:text-ink hover:underline"
          >
            {t('vocab')}
          </Link>
          <Link
            href="/admin/content/grammar"
            className="text-ink-muted hover:text-ink hover:underline"
          >
            {t('grammar')}
          </Link>
          <Link
            href="/admin/content/listening"
            className="text-ink-muted hover:text-ink hover:underline"
          >
            {t('listening')}
          </Link>
          <Link
            href="/admin/content/diagnostic"
            className="text-ink-muted hover:text-ink hover:underline"
          >
            {t('diagnostic')}
          </Link>
          <Link
            href="/admin/content/skill-tags"
            className="text-ink-muted hover:text-ink hover:underline"
          >
            {t('skillTags')}
          </Link>
          <div className="mt-4 text-xs font-semibold uppercase text-ink-muted">Operations</div>
          <Link href="/admin/users" className="text-ink-muted hover:text-ink hover:underline">
            {t('users')}
          </Link>
          <Link href="/admin/ai-review" className="text-ink-muted hover:text-ink hover:underline">
            {t('aiReview')}
          </Link>
          <Link href="/admin/feedback" className="text-ink-muted hover:text-ink hover:underline">
            {t('feedback')}
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
