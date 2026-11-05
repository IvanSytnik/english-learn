import { WordsBrowsePage } from '../../_browse/words-browse-page';

/** `/words/topics/[topic]`: every word of a topic, by level (B6.6). */
export default async function TopicWordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { topic } = await params;
  return <WordsBrowsePage page={{ kind: 'topic', topic }} searchParams={await searchParams} />;
}
