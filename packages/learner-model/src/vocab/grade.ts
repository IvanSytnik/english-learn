import type { VocabAnswerKey } from './card';
import { normalizeAnswer } from './text';

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

export function gradeVocabAnswer(key: VocabAnswerKey, answer: VocabAnswer): VocabGrade {
  if (answer.kind === 'dont_know') return 'DONT_KNOW';
  if (key.kind === 'choice') {
    if (answer.kind !== 'choice' || !Number.isInteger(answer.index) || answer.index < 0) {
      return 'INVALID';
    }
    if (answer.index > 3) return 'INVALID';
    return answer.index === key.correctIndex ? 'CORRECT' : 'INCORRECT';
  }
  if (answer.kind !== 'text') return 'INVALID';
  const typed = normalizeAnswer(answer.text);
  if (typed.length === 0) return 'INVALID';
  if (key.accepted.includes(typed)) return 'CORRECT';
  if (key.synonyms.includes(typed)) return 'SYNONYM_COLLISION';
  return 'INCORRECT';
}
