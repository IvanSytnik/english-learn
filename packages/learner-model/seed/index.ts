import type { Concept } from '../src/core/graph/types';
import { GRAMMAR_CONCEPTS } from './concepts/grammar';
import { VOCAB_CONCEPTS } from './concepts/vocab';
import { SEED_EDGES } from './edges';

export const SEED_CONCEPTS: Concept[] = [...GRAMMAR_CONCEPTS, ...VOCAB_CONCEPTS];

export { SEED_EDGES };

/** Convenience: full seed payload. */
export const SEED_GRAPH = {
  concepts: SEED_CONCEPTS,
  edges: SEED_EDGES,
} as const;
