import { isLocale } from '@englishlearn/db/schemas';
import { getLocale } from 'next-intl/server';
import { Footer } from '@/app/_components/footer';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { loadVocabOverview } from '@/lib/vocab-overview';
import { WordsOverview } from './words-overview';

export default async function WordsPage() {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user?.id) return redirect({ href: '/login', locale });
  // Vocabulary lives in the learner model, which only students have.
  if (session.user.role !== 'STUDENT') return redirect({ href: '/dashboard', locale });

  // The server does not know the browser's zone: UTC first, the client
  // refreshes the day-dependent counts in its own zone after mounting.
  const initial = await loadVocabOverview({
    userId: session.user.id,
    uiLocale: isLocale(locale) ? locale : 'en',
    timeZone: 'UTC',
  });

  return (
    <>
      <WordsOverview initial={initial} />
      <Footer />
    </>
  );
}
