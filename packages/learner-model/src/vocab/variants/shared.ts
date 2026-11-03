import { makeRng, type Rng, seedFromString } from '../../policy/rng';
import { DISTRACTOR_COUNT, pickDistractors, shuffle } from '../distractors';
import type { VocabAnswer, VocabGrade, VocabGradingKey } from '../grade';
import { containsWholeWord, glossKey, glossOf, normalizeAnswer } from '../text';
import type { VocabLexeme, VocabLocale, VocabMode } from '../types';
import type { VocabAnswerKey, VocabCard, VocabCardInput, VocabCardView } from './types';

/** Helpers every variant shares: the RNG of a card, distractors, the choice shuffle, grading. */

export class VocabCardError extends Error {
  override name = 'VocabCardError';
}

/** The card's own draws: seeded by the served question and the variant id. */
export const cardRng = (input: { seed: string }, id: VocabMode): Rng =>
  makeRng(seedFromString(`${input.seed}:${id}`));

/**
 * The gloss shown as a prompt (modes 2, 4, 5). A cognate gloss that contains
 * the answer (`die Bank` for `bank`, `DVD`) would give it away, so the
 * English definition stands in.
 */
export function promptGloss(target: VocabLexeme, locale: VocabLocale): string {
  const gloss = glossOf(target, locale);
  const reveals = [target.lemma, ...target.variants].some((answer) =>
    containsWholeWord(gloss, answer),
  );
  return reveals ? target.definitions.en : gloss;
}

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
  input: VocabCardInput,
  rng: Rng,
  targetOption: string,
  optionOf: (l: VocabLexeme) => string | null,
): ChoiceOption[] {
  const picked = pickDistractors({
    target: input.target,
    pool: input.pool,
    locale: input.locale,
    rng,
    optionOf,
    targetOption,
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
