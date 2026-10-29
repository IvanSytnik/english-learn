import type { PartOfSpeechValue, PracticeModeValue } from '@englishlearn/db/schemas';
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
export type VocabLocale = 'ru' | 'uk' | 'de' | 'en';

/** The five practice modes of the word ladder (B2.1 / B2.5). */
export const VOCAB_MODES = ['en_to_l1', 'l1_to_en', 'cloze', 'cued_recall', 'full_recall'] as const;
export type VocabMode = (typeof VOCAB_MODES)[number];

/** The event payload's coarser mode (LearnerEvent `mode`). */
export const PAYLOAD_MODE: Readonly<Record<VocabMode, PracticeModeValue>> = Object.freeze({
  en_to_l1: 'recognition',
  l1_to_en: 'recognition',
  cloze: 'cloze',
  cued_recall: 'recall',
  full_recall: 'recall',
});
