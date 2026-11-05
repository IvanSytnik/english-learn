import { countWholeWord } from '@englishlearn/db/schemas';
import { CEFR_RANK, type CEFRLevel } from '../../core/graph/types';
import { makeRng, type Rng, seedFromString } from '../../policy/rng';
import { DISTRACTOR_COUNT, pickDistractors, shuffle } from '../distractors';
import type { VocabAnswer, VocabGrade, VocabGradingKey } from '../grade';
import { containsWholeWord, glossKey, glossOf, normalizeAnswer, surfaceForms } from '../text';
import type { VocabExample, VocabLexeme, VocabLocale, VocabVariantId } from '../types';
import type { VocabAnswerKey, VocabBuildInput, VocabCard, VocabCardView } from './types';

/** Helpers every variant shares: the RNG of a card, distractors, the choice shuffle, grading. */

export class VocabCardError extends Error {
  override name = 'VocabCardError';
}

/** The card's own draws: seeded by the served question and the variant id. */
export const cardRng = (input: { seed: string }, id: VocabVariantId): Rng =>
  makeRng(seedFromString(`${input.seed}:${id}`));

/**
 * The example sentence of one served card (B6.5 rotation): index
 * `seedFromString(cardSeed) mod n` over the examples whose clozeTarget occurs
 * exactly once as a whole word (LexemeExampleSchema's rule). The same card
 * seed, the same sentence — a reload and the grader see what was shown; the
 * next review of the word (a new seed) may show another. Null: none.
 */
export function rotatedExample(target: VocabLexeme, seed: string): VocabExample | null {
  const valid = target.examples.filter((ex) => countWholeWord(ex.sentence, ex.clozeTarget) === 1);
  return valid[seedFromString(seed) % valid.length] ?? null;
}

/**
 * The gloss shown as a prompt (modes 2, 4, 5). A cognate gloss that contains
 * the answer (`die Bank` for `bank`, `DVD`) would give it away, so the
 * English definition stands in.
 */
export function promptGloss(target: VocabLexeme, locale: VocabLocale): string {
  const gloss = glossOf(target, locale);
  return namesWord(gloss, target) ? target.definitions.en : gloss;
}

/** `text` names the word: its lemma or a spelling variant occurs in it as a whole word. */
export const namesWord = (text: string, lexeme: Pick<VocabLexeme, 'lemma' | 'variants'>) =>
  [lexeme.lemma, ...lexeme.variants].some((spelling) => containsWholeWord(text, spelling));

/**
 * `text` gives the word away: promptGloss's check, or any of its surface
 * forms (`decides` in a definition of `decide`) as a whole word.
 */
export const revealsWord = (text: string, lexeme: VocabLexeme) =>
  namesWord(text, lexeme) || surfaceForms(lexeme).some((form) => containsWholeWord(text, form));

/** "Learner ≥ B1" (B6-SPEC §3): an assessed level of B1 or above; no level is below. */
export const atLeastB1 = (level: CEFRLevel | null | undefined) =>
  level != null && CEFR_RANK[level] >= CEFR_RANK.B1;

/** Accepted spellings of the target and the forms of its same-gloss synonyms. */
export function recallKey(target: VocabLexeme, pool: readonly VocabLexeme[], locale: VocabLocale) {
  const accepted = [...new Set([target.lemma, ...target.variants].map(normalizeAnswer))];
  const gloss = glossKey(target, locale);
  const synonyms = pool
    .filter((l) => l.id !== target.id && glossKey(l, locale) === gloss)
    .flatMap((l) => [l.lemma, ...l.variants].map(normalizeAnswer))
    .filter((form) => !accepted.includes(form));
  return { accepted, synonyms: [...new Set(synonyms)].sort() };
}

export type ChoiceOption = { option: string; lexemeId: string };

export function pickFor(
  input: Pick<VocabBuildInput, 'target' | 'pool' | 'locale'>,
  rng: Rng,
  targetOption: string,
  optionOf: (l: VocabLexeme) => string | null,
  opts: { avoidGlossOverlap?: boolean } = {},
): ChoiceOption[] {
  const picked = pickDistractors({
    target: input.target,
    pool: input.pool,
    locale: input.locale,
    rng,
    optionOf,
    targetOption,
    avoidGlossOverlap: opts.avoidGlossOverlap,
  });
  return picked.map((d) => ({ option: d.option, lexemeId: d.lexeme.id }));
}

type ChoiceView = Extract<VocabCardView, { options: string[] }>;
/** A choice view without its options (distributive, one per mode). */
export type ChoicePrompt = ChoiceView extends infer V
  ? V extends ChoiceView
    ? Omit<V, 'options'>
    : never
  : never;

export function choice(
  prompt: ChoicePrompt,
  correct: ChoiceOption,
  distractors: ChoiceOption[],
  rng: Rng,
): VocabCard {
  if (distractors.length < DISTRACTOR_COUNT) {
    throw new VocabCardError(`only ${distractors.length} distractors (${prompt.mode})`);
  }
  // The same Fisher–Yates draws as on the option strings alone: a card shows
  // exactly what it showed before the ids rode along.
  const shuffled = shuffle([correct, ...distractors], rng);
  return {
    view: { ...prompt, options: shuffled.map((o) => o.option) } as ChoiceView,
    key: {
      kind: 'choice',
      mode: prompt.mode,
      correctIndex: shuffled.indexOf(correct),
      optionLexemeIds: shuffled.map((o) => o.lexemeId),
    },
  };
}

/** A choice answer: by index alone (the web grades against the index sealed in the vocabRef). */
export function gradeChoice(key: VocabGradingKey, answer: VocabAnswer): VocabGrade {
  if (answer.kind === 'dont_know') return 'DONT_KNOW';
  if (key.kind !== 'choice') return 'INVALID';
  if (answer.kind !== 'choice' || !Number.isInteger(answer.index) || answer.index < 0) {
    return 'INVALID';
  }
  if (answer.index > 3) return 'INVALID';
  return answer.index === key.correctIndex ? 'CORRECT' : 'INCORRECT';
}

/** A typed answer: normalized, against the accepted forms, then the same-gloss synonyms. */
export function gradeText(key: VocabGradingKey, answer: VocabAnswer): VocabGrade {
  if (answer.kind === 'dont_know') return 'DONT_KNOW';
  if (key.kind !== 'text' || answer.kind !== 'text') return 'INVALID';
  const typed = normalizeAnswer(answer.text);
  if (typed.length === 0) return 'INVALID';
  if (key.accepted.includes(typed)) return 'CORRECT';
  if (key.synonyms.includes(typed)) return 'SYNONYM_COLLISION';
  return 'INCORRECT';
}

export type { VocabAnswerKey };
