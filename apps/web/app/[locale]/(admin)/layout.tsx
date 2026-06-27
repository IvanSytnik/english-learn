import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { auth } from '@/lib/auth';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (session?.user?.role !== 'ADMIN') {
    redirect('/login');
  }

  const t = await getTranslations('admin.nav');

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-gray-200 bg-white p-4">
        <div className="mb-6 font-semibold">Admin</div>
        <nav className="flex flex-col gap-2 text-sm">
          <div className="mt-2 text-xs font-semibold uppercase text-gray-500">{t('content')}</div>
          <Link href="/admin/content/vocab" className="text-gray-700 hover:text-blue-600">
            {t('vocab')}
          </Link>
          <Link href="/admin/content/grammar" className="text-gray-700 hover:text-blue-600">
            {t('grammar')}
          </Link>
          <Link href="/admin/content/listening" className="text-gray-700 hover:text-blue-600">
            {t('listening')}
          </Link>
          <Link href="/admin/content/diagnostic" className="text-gray-700 hover:text-blue-600">
            {t('diagnostic')}
          </Link>
          <Link href="/admin/content/skill-tags" className="text-gray-700 hover:text-blue-600">
            {t('skillTags')}
          </Link>
          <div className="mt-4 text-xs font-semibold uppercase text-gray-500">Operations</div>
          <Link href="/admin/users" className="text-gray-700 hover:text-blue-600">
            {t('users')}
          </Link>
          <Link href="/admin/ai-review" className="text-gray-700 hover:text-blue-600">
            {t('aiReview')}
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
