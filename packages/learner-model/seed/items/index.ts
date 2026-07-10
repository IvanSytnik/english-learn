import { GRAMMAR_ITEMS } from './grammar-items';
import type { SeedItem } from './types';
import { VOCAB_ITEMS } from './vocab-items';

export const ALL_ITEMS: SeedItem[] = [...GRAMMAR_ITEMS, ...VOCAB_ITEMS];

export type { SeedItem } from './types';
