import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { auth } from '@/lib/auth';
import { proveSlugFromSearchParams, scopeFromSearchParams } from '@/lib/vocab-scope';
import { ownsActiveList } from '@/lib/word-lists';
import { VocabPlayer } from './vocab-player';

/**
 * A vocabulary session: the whole pool, one topic level (`?concept=`), one
 * collection (`?collection=`) or one of the learner's lists (`?list=`, B6.7 —
 * another learner's, an archived or unknown list is a 404) — the scope
 * narrows new words; due reviews of every topic still come first. `?prove=<slug>` ("I know" on a word page,
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
  const scope = scopeFromSearchParams(params);
  // A list is named by id: malformed, foreign, archived or unknown → 404.
  if (params.list !== undefined) {
    if (scope?.kind !== 'list' || !(await ownsActiveList(session.user.id, scope.listId))) {
      notFound();
    }
  }
  return <VocabPlayer scope={scope} proveSlug={proveSlugFromSearchParams(params)} />;
}
