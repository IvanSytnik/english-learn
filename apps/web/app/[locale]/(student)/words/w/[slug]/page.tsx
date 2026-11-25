import { isLocale } from '@englishlearn/db/schemas';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { Footer } from '@/app/_components/footer';
import { requireRole } from '@/lib/authz';
import { loadWordPage } from '@/lib/vocab-word';
import { WordView } from './word-view';

/** Not indexed until the public word pages (C4). */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * `/words/w/[slug]` (B6.8): one published word, rendered on the server for a
 * learner. A malformed, unknown or ambiguous slug is a 404 — never a guess
 * (B6-SPEC §5 guardrail).
 */
export default async function WordPage({ params }: { params: Promise<{ slug: string }> }) {
  // Words live in the learner model, which only students have.
  const user = await requireRole('STUDENT');
  const { slug } = await params;
  const locale = await getLocale();
  const view = await loadWordPage({
    userId: user.id,
    uiLocale: isLocale(locale) ? locale : 'en',
    slug,
  });
  if (!view) notFound();
  return (
    <>
      <WordView key={view.slug} view={view} />
      <Footer />
    </>
  );
}
