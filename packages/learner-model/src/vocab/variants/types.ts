import type { PracticeModeValue } from '@englishlearn/db/schemas';
import type { VocabAnswer, VocabGrade, VocabGradingKey } from '../grade';
import type { VocabLexeme, VocabLocale, VocabMode } from '../types';

/**
 * One vocabulary question, built twice from the same input: when it is served
 * and when the answer is graded (stateless, like the diagnostic). `view` is
 * all the client ever gets — no correct index, no accepted answers, no lexeme
 * id (Axiom 3); `key` stays on the server.
 */

export type VocabCardView =
  /** Mode 1: the English word, choose its meaning. */
  | { mode: 'en_to_l1'; word: string; ipa: string | null; options: string[] }
  /** Mode 2: the meaning, choose the English word. */
  | { mode: 'l1_to_en'; gloss: string; options: string[] }
  /** Mode 3: a sentence with a gap, choose what fills it. */
  | { mode: 'cloze'; sentence: string; options: string[] }
  /** Mode 4: the meaning and a first-letter cue (`l___ u_`), type the word. */
  | { mode: 'cued_recall'; gloss: string; cue: string }
  /** Mode 5: the meaning, type the word. */
  | { mode: 'full_recall'; gloss: string };

export type VocabAnswerKey =
  | {
      kind: 'choice';
      mode: 'en_to_l1' | 'l1_to_en' | 'cloze';
      correctIndex: number;
      /**
       * Lexeme id behind each option, in display order (the target's at
       * correctIndex). Server-side only: which word a wrong pick confused.
       */
      optionLexemeIds: string[];
    }
  | {
      kind: 'text';
      mode: 'cued_recall' | 'full_recall';
      /** Normalized accepted answers: the lemma and its spelling variants. */
      accepted: string[];
      /** Normalized forms of other words with the same gloss (soft response). */
      synonyms: string[];
    };

export type VocabCard = { view: VocabCardView; key: VocabAnswerKey };

export type VocabCardInput = {
  target: VocabLexeme;
  /** PUBLISHED vocabulary to draw distractors and synonyms from (may include the target). */
  pool: readonly VocabLexeme[];
  mode: VocabMode;
  locale: VocabLocale;
  /** Stable per served question — see cardSeed. */
  seed: string;
};

/** What a variant may look at besides its word (B6-SPEC §3 `eligible(lexeme, learner)`). */
export type VariantContext = Omit<VocabCardInput, 'target' | 'mode'>;

/**
 * One exercise variant of the word ladder (B6.3). Today one variant per
 * mode, each in its own module; B6.5 adds variants inside a mode. A new id
 * joins the payload `variant` enum schema-first.
 */
export type VocabVariant<M extends VocabMode = VocabMode> = {
  id: M;
  /** The event payload's coarser `mode` this variant records. */
  payloadMode: PracticeModeValue;
  /** Lower bound on FSRS stability S (days) of this rung; the ladder reads it. */
  ladderFrom: number;
  keyKind: VocabAnswerKey['kind'];
  /** Whether the card can be built fairly for this word. */
  eligible(target: VocabLexeme, ctx: VariantContext): boolean;
  /** The variant served instead when `eligible` is false. */
  fallback?: VocabMode;
  build(input: VocabCardInput & { mode: M }): VocabCard;
  grade(key: VocabGradingKey, answer: VocabAnswer): VocabGrade;
};
