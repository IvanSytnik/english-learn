import type { VocabAnswerKey } from './card';
import { vocabVariant } from './variants';

/**
 * Server-side grading of one vocabulary answer against the rebuilt card's key.
 *
 *   CORRECT / INCORRECT — recorded as an outcome (recordVocabOutcome).
 *   DONT_KNOW           — recorded as an incorrect answer (`dontKnow`).
 *   SYNONYM_COLLISION   — a typed word that is another lexeme with the same
 *                         gloss in the learner's language (`over` for «над»
 *                         when `above` is asked): NOT recorded; the UI asks
 *                         for the other word, FSRS is not penalized.
 *   INVALID             — an answer of the wrong kind or an index out of
 *                         range (a stale or forged request): not recorded.
 *
 * Typed answers compare normalized (case, spaces, curly apostrophes) against
 * the lemma and its spelling variants (`behavior` / `behaviour`).
 */

export type VocabAnswer =
  | { kind: 'choice'; index: number }
  | { kind: 'text'; text: string }
  | { kind: 'dont_know' };

export type VocabGrade = 'CORRECT' | 'INCORRECT' | 'DONT_KNOW' | 'SYNONYM_COLLISION' | 'INVALID';

/**
 * What grading needs of a key: a choice is graded by its index alone (the
 * web grades against the index sealed in the vocabRef), so the option ids
 * are not required.
 */
export type VocabGradingKey =
  | Omit<Extract<VocabAnswerKey, { kind: 'choice' }>, 'optionLexemeIds'>
  | Extract<VocabAnswerKey, { kind: 'text' }>;

/** Grades with the key's own variant (./variants): choice by index, text by normalized form. */
export function gradeVocabAnswer(key: VocabGradingKey, answer: VocabAnswer): VocabGrade {
  return vocabVariant(key.mode).grade(key, answer);
}
