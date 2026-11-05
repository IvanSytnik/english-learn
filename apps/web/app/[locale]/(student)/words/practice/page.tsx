import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { proveSlugFromSearchParams, scopeFromSearchParams } from '@/lib/vocab-scope';
import { VocabPlayer } from './vocab-player';

/**
 * A vocabulary session: the whole pool, one topic level (`?concept=`) or one
 * collection (`?collection=`) — the scope narrows new words; due reviews of
 * every topic still come first. `?prove=<slug>` ("I know" on a word page,
 * B6.6) opens the session on that word's proof.
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

  const params = await searchParams;
  return (
    <VocabPlayer
      scope={scopeFromSearchParams(params)}
      proveSlug={proveSlugFromSearchParams(params)}
    />
  );
}
