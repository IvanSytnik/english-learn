import { isLocale, WordListIdSchema } from '@englishlearn/db/schemas';
import { SEARCH_MIN_CHARS } from '@englishlearn/learner-model';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Footer } from '@/app/_components/footer';
import { requireRole } from '@/lib/authz';
import { pageParam } from '@/lib/page-param';
import { loadWordListPage } from '@/lib/word-lists';
import { ListEditor } from '../_components/list-editor';

/**
 * `/words/lists/[id]` (B6.7): one of the learner's lists, ≤ 100 rows a page.
 * A malformed id, another learner's or an unknown list, or a page past the
 * last is a 404 — never a 403 (B6-SPEC Axiom 3).
 */
export default async function WordListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole('STUDENT');
  const id = WordListIdSchema.safeParse((await params).id);
  if (!id.success) notFound();
  const pageNumber = pageParam((await searchParams).page);
  if (pageNumber === null) notFound();
  const locale = await getLocale();
  const view = await loadWordListPage({
    userId: user.id,
    uiLocale: isLocale(locale) ? locale : 'en',
    listId: id.data,
    pageNumber,
  });
  if (!view) notFound();
  return (
    <>
      {/* A new page starts from its own rows, not the last page's optimistic state. */}
      <ListEditor key={`${view.id}:${pageNumber}`} view={view} searchMinChars={SEARCH_MIN_CHARS} />
      <Footer />
    </>
  );
}
