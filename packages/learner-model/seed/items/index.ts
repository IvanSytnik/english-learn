import { GRAMMAR_ITEMS } from './grammar-items';
import { ITEM_PRACTICE } from './practice';
import type { SeedItem } from './types';
import { VOCAB_ITEMS } from './vocab-items';

/** Merge the item's practice question (practice.ts) into its content. */
function withPractice(item: SeedItem): SeedItem {
  const practice = ITEM_PRACTICE[item.id];
  return practice ? { ...item, content: { ...(item.content as object), practice } } : item;
}

export const ALL_ITEMS: SeedItem[] = [...GRAMMAR_ITEMS, ...VOCAB_ITEMS].map(withPractice);

export type { SeedItem } from './types';
