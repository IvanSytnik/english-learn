import {
  type PartOfSpeechValue,
  type PracticeModeValue,
  VOCAB_VARIANT_MODE,
  type VocabLocaleValue,
  VocabVariantValue,
} from '@englishlearn/db/schemas';
import type { CEFRLevel } from '../core/graph/types';

/**
 * Plain data the vocabulary engine works on: a PUBLISHED Lexeme joined with
 * its VOCAB_WORD item (concept, spelling variants). No Prisma here — the
 * caller loads and maps rows; everything in vocab/ is a pure function of it.
 */
export type VocabLexeme = {
  id: string;
  /** Display form ("English", "look up"). */
  lemma: string;
  /** Comparison key, lower(trim(lemma)). */
  lemmaKey: string;
  pos: PartOfSpeechValue;
  cefrLevel: CEFRLevel;
  /** Topic concept of the word's item (`vocab.<topic>.<level>`). */
  conceptId: string;
  ipa?: string | null;
  definitions: { en: string };
  translations: { ru?: string; uk?: string; de?: string };
  examples: readonly VocabExample[];
  /** Other accepted spellings (Item.content.variants). */
  variants: readonly string[];
};

export type VocabExample = {
  sentence: string;
  translation: { ru?: string; uk?: string; de?: string };
  /** Surface form to blank out; may be inflected ("ran" for "run"). */
  clozeTarget: string;
};

/**
 * Language of the learner-side text: the gloss (modes 1, 2, 4, 5). `en` is
 * the learner whose native language is `other` (or unknown) — there is no
 * English gloss, so the English definition stands in.
 */
export type VocabLocale = VocabLocaleValue;

/**
 * The five practice modes of the word ladder (B2.1 / B2.5). Defined once in
 * @englishlearn/db (the payload's `variant` enum), never duplicated here.
 */
export const VOCAB_MODES = VocabVariantValue.options;
export type VocabMode = VocabVariantValue;

/** The event payload's coarser mode (LearnerEvent `mode`). */
export const PAYLOAD_MODE: Readonly<Record<VocabMode, PracticeModeValue>> = VOCAB_VARIANT_MODE;
