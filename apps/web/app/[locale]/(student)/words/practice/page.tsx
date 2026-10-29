import { parseVocabConceptId } from '@englishlearn/db/vocab/topics';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { VocabPlayer } from './vocab-player';

/**
 * A vocabulary session: the whole pool, or one topic level (`?concept=`).
 * The first card is loaded by the player in the browser's time zone — the
 * daily new-word allowance counts from the learner's local midnight.
 */
export default async function WordsPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const locale = await getLocale();
  const session = await auth();
  if (!session?.user?.id) return redirect({ href: '/login', locale });
  // Vocabulary lives in the learner model, which only students have.
  if (session.user.role !== 'STUDENT') return redirect({ href: '/dashboard', locale });

  // Only a real topic concept narrows the session; anything else (unknown,
  // repeated) is the whole pool.
  const concept = (await searchParams).concept;
  const conceptId =
    typeof concept === 'string' && parseVocabConceptId(concept) !== null ? concept : undefined;

  return <VocabPlayer conceptId={conceptId} />;
}
