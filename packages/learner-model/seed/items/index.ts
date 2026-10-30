import type { Practice } from '@englishlearn/db/schemas';
import { GRAMMAR_ITEMS } from './grammar';
import type { SeedItem } from './types';
import { VOCAB_ITEMS } from './vocab-items';
import { VOCAB_PRACTICE } from './vocab-practice';

/** Merge the vocabulary item's practice question (vocab-practice.ts) into its content. */
function withPractice(item: SeedItem): SeedItem {
  const practice = VOCAB_PRACTICE[item.id];
  return practice ? { ...item, content: { ...(item.content as object), practice } } : item;
}

export const ALL_ITEMS: SeedItem[] = [...GRAMMAR_ITEMS, ...VOCAB_ITEMS.map(withPractice)];

/** Every seed question by item id (grammar and vocabulary). */
export const ITEM_PRACTICE: Readonly<Record<string, Practice>> = Object.fromEntries(
  ALL_ITEMS.flatMap((i) => {
    const { practice } = i.content as { practice?: Practice };
    return practice ? [[i.id, practice]] : [];
  }),
);

export type { SeedItem } from './types';
