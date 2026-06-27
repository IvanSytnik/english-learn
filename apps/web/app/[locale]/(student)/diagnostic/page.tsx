import { Button, Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';

export default async function DiagnosticPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const t = await getTranslations('student.diagnostic');

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-6 text-gray-600">{t('intro')}</p>
          <Button>{t('start')}</Button>
          {/* Pseudo-CAT engine wires up in next phase. */}
        </CardContent>
      </Card>
    </main>
  );
}
