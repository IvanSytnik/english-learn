import { isLocale } from '@englishlearn/db/schemas';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Footer } from '@/app/_components/footer';
import { requireRole } from '@/lib/authz';
import { loadWordsPage, WordsPageSchema } from '@/lib/vocab-words';
import { WordsBrowser } from './words-browser';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `?page=` as a 1-based page number: absent → 1; anything else but a plain
 * positive integer (repeated, `0`, `01`, `2.5`, `-1`) → null (404).
 */
export function pageParam(value: SearchParams[string]): number | null {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value)) return null;
  return Number(value);
}

/**
 * A word page (B6.6), rendered on the server for a learner: the topic or
 * collection must be on the allowlist (the taxonomy's topics, the curated
 * VOCAB_COLLECTIONS) and the page in range — anything else is a 404.
 */
export async function WordsBrowsePage({
  page: input,
  searchParams,
}: {
  page: { kind: 'topic'; topic: string } | { kind: 'collection'; key: string };
  searchParams: SearchParams;
}) {
  // Words live in the learner model, which only students have.
  const user = await requireRole('STUDENT');
  const page = WordsPageSchema.safeParse(input);
  if (!page.success) notFound();
  const pageNumber = pageParam(searchParams.page);
  if (pageNumber === null) notFound();
  const locale = await getLocale();
  const view = await loadWordsPage({
    userId: user.id,
    uiLocale: isLocale(locale) ? locale : 'en',
    page: page.data,
    pageNumber,
  });
  if (!view) notFound();
  return (
    <>
      {/* A new page starts from its own rows, not the last page's optimistic state. */}
      <WordsBrowser key={pageNumber} page={page.data} view={view} />
      <Footer />
    </>
  );
}
