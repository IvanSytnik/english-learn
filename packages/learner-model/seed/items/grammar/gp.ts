/**
 * Builder for GRAMMAR_PATTERN seed items: one file per grammar concept, each
 * item next to its practice question.
 *
 * Granularity rule: one item = one thing a learner can get wrong
 * independently. IDs are stable ("item.<concept-short>.<slug>") to make the
 * seed upsert idempotent — same convention as Concept IDs.
 */

import type { Practice } from '@englishlearn/db/schemas';
import type { SeedItem } from '../types';

type Localized = { en: string; ru?: string; uk?: string; de?: string };

export type GrammarSeed = {
  slug: string;
  level: SeedItem['cefrLevel'];
  /** Compact formula; also the `H` hint, so it must not give the answer away. */
  pattern: string;
  example: string;
  contrast?: string;
  explanation: Localized;
  usageNote?: Localized;
  practice: Practice;
};

export function grammarItems(conceptId: string, seeds: readonly GrammarSeed[]): SeedItem[] {
  return seeds.map((s) => ({
    id: `item.${conceptId.replace('grammar.', '')}.${s.slug}`,
    conceptId,
    kind: 'GRAMMAR_PATTERN',
    cefrLevel: s.level,
    content: {
      source: {
        pattern: s.pattern,
        example: s.example,
        ...(s.contrast ? { contrastExample: s.contrast } : {}),
      },
      localized: {
        explanation: s.explanation,
        ...(s.usageNote ? { usageNote: s.usageNote } : {}),
      },
      practice: s.practice,
    },
  }));
}
