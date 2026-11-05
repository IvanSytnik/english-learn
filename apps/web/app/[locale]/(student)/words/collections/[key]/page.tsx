import { WordsBrowsePage } from '../../_browse/words-browse-page';

/** `/words/collections/[key]`: every word of a curated collection, by level (B6.6). */
export default async function CollectionWordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { key } = await params;
  return <WordsBrowsePage page={{ kind: 'collection', key }} searchParams={await searchParams} />;
}
