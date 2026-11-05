import type { PracticeModeValue } from '@englishlearn/db/schemas';
import type { CEFRLevel } from '../../core/graph/types';
import type { VocabAnswer, VocabGrade, VocabGradingKey } from '../grade';
import type { VocabLexeme, VocabLocale, VocabMode, VocabVariantId } from '../types';

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
  /** Mode 2, a B1+ learner (B6.5): the English definition, choose the English word. */
  | { mode: 'definition_to_en'; definition: string; options: string[] }
  /** Mode 3: a sentence with a gap, choose what fills it. */
  | { mode: 'cloze'; sentence: string; options: string[] }
  /** Mode 3, a B1+ learner (B6.5): a collocation with a gap (`make a ___`), choose what fills it. */
  | { mode: 'collocation'; phrase: string; options: string[] }
  /** Mode 4: the meaning and a first-letter cue (`l___ u_`), type the word. */
  | { mode: 'cued_recall'; gloss: string; cue: string }
  /** Mode 5: the meaning, type the word. */
  | { mode: 'full_recall'; gloss: string };

export type VocabAnswerKey =
  | {
      kind: 'choice';
      mode: ChoiceVariantId;
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

/** The variants answered by choosing one of four options. */
export type ChoiceVariantId =
  | 'en_to_l1'
  | 'l1_to_en'
  | 'definition_to_en'
  | 'cloze'
  | 'collocation';

export type VocabCard = { view: VocabCardView; key: VocabAnswerKey };

export type VocabCardInput = {
  target: VocabLexeme;
  /** PUBLISHED vocabulary to draw distractors and synonyms from (may include the target). */
  pool: readonly VocabLexeme[];
  /** The ladder rung; the card served is one of its eligible variants. */
  mode: VocabMode;
  locale: VocabLocale;
  /** Stable per served question — see cardSeed. */
  seed: string;
  /**
   * The learner's assessed level (the diagnostic). Null or absent = below B1:
   * only the rungs' own cards (B6-SPEC §3 "learner ≥ B1").
   */
  learnerLevel?: CEFRLevel | null;
};

/**
 * What building one given variant takes: the card input without the rung
 * and the learner — whether the variant fits was decided when it was chosen,
 * so a served card rebuilds from its sealed variant id alone.
 */
export type VocabBuildInput = Omit<VocabCardInput, 'mode' | 'learnerLevel'>;

/** What a variant may look at besides its word (B6-SPEC §3 `eligible(lexeme, learner)`). */
export type VariantContext = Omit<VocabCardInput, 'target' | 'mode'>;

/**
 * One exercise variant of the word ladder (B6.3), each in its own module. A
 * rung's own variant has the rung's id; B6.5 adds variants served on a rung
 * instead of it. A new id joins the payload `variant` enum schema-first.
 */
export type VocabVariant<M extends VocabVariantId = VocabVariantId> = {
  id: M;
  /** The ladder rung this variant is served on (its own id for a rung's own card). */
  rung: VocabMode;
  /** The event payload's coarser `mode` this variant records. */
  payloadMode: PracticeModeValue;
  keyKind: VocabAnswerKey['kind'];
  /** Whether the card can be built fairly for this word and learner. */
  eligible(target: VocabLexeme, ctx: VariantContext): boolean;
  /** The variant served instead when no variant of the rung is eligible. */
  fallback?: VocabVariantId;
  build(input: VocabBuildInput & { mode: M }): VocabCard;
  grade(key: VocabGradingKey, answer: VocabAnswer): VocabGrade;
};

/** A rung's own variant, which also says where the rung starts. */
export type VocabRungVariant<M extends VocabMode = VocabMode> = VocabVariant<M> & {
  /** Lower bound on FSRS stability S (days) of this rung; the ladder reads it. */
  ladderFrom: number;
};
