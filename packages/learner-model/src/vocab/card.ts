import { PRACTICE_GAP } from '@englishlearn/db/schemas';
import { makeRng, type Rng, seedFromString } from '../policy/rng';
import { DISTRACTOR_COUNT, pickDistractors, shuffle } from './distractors';
import {
  articleFor,
  containsWholeWord,
  findClozeSpan,
  glossKey,
  glossOf,
  matchInitialCase,
  normalizeAnswer,
  recallCue,
  type SurfaceShape,
  surfaceShape,
} from './text';
import type { VocabLexeme, VocabLocale, VocabMode } from './types';

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
  | { kind: 'choice'; mode: 'en_to_l1' | 'l1_to_en' | 'cloze'; correctIndex: number }
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

/**
 * Seed of one served question: the same until the word is answered (its
 * review moment changes), so a reload shows the same choices and the grader
 * rebuilds exactly what was shown.
 */
export const cardSeed = (args: { userId: string; itemId: string; lastReviewAt: bigint | null }) =>
  `${args.userId}:${args.itemId}:${args.lastReviewAt ?? 'new'}`;

export class VocabCardError extends Error {
  override name = 'VocabCardError';
}

export function buildVocabCard(input: VocabCardInput): VocabCard {
  const { target, pool, mode, locale } = input;
  const rng = makeRng(seedFromString(`${input.seed}:${mode}`));

  switch (mode) {
    case 'en_to_l1': {
      const correct = glossOf(target, locale);
      return choice(
        { mode, word: target.lemma, ipa: target.ipa ?? null },
        correct,
        pickFor(input, rng, correct, (l) => glossOf(l, locale)),
        rng,
      );
    }
    case 'l1_to_en': {
      return choice(
        { mode, gloss: promptGloss(target, locale) },
        target.lemma,
        pickFor(input, rng, target.lemma, (l) => l.lemma),
        rng,
      );
    }
    case 'cloze':
      // A blank whose form no three other words share (`kind-hearted`) is no
      // fair choice: the mode below takes its place. The served mode is
      // `view.mode` — that is what the payload records.
      return clozeCard(input, rng) ?? buildVocabCard({ ...input, mode: 'l1_to_en' });
    case 'cued_recall':
    case 'full_recall': {
      const gloss = promptGloss(target, locale);
      const view: VocabCardView =
        mode === 'cued_recall' ? { mode, gloss, cue: recallCue(target.lemma) } : { mode, gloss };
      return { view, key: { kind: 'text', mode, ...recallKey(target, pool, locale) } };
    }
  }
}

/**
 * The gloss shown as a prompt (modes 2, 4, 5). A cognate gloss that contains
 * the answer (`die Bank` for `bank`, `DVD`) would give it away, so the
 * English definition stands in.
 */
function promptGloss(target: VocabLexeme, locale: VocabLocale): string {
  const gloss = glossOf(target, locale);
  const reveals = [target.lemma, ...target.variants].some((answer) =>
    containsWholeWord(gloss, answer),
  );
  return reveals ? target.definitions.en : gloss;
}

/** Accepted spellings of the target and the forms of its same-gloss synonyms. */
function recallKey(target: VocabLexeme, pool: readonly VocabLexeme[], locale: VocabLocale) {
  const accepted = [...new Set([target.lemma, ...target.variants].map(normalizeAnswer))];
  const gloss = glossKey(target, locale);
  const synonyms = pool
    .filter((l) => l.id !== target.id && glossKey(l, locale) === gloss)
    .flatMap((l) => [l.lemma, ...l.variants].map(normalizeAnswer))
    .filter((form) => !accepted.includes(form));
  return { accepted, synonyms: [...new Set(synonyms)].sort() };
}

/** Null when fewer than three other words share the blank's form. */
function clozeCard(input: VocabCardInput, rng: Rng): VocabCard | null {
  const { target } = input;
  const example = target.examples[0];
  if (!example) throw new VocabCardError(`"${target.lemma}" has no example sentence`);

  const span = findClozeSpan(example.sentence, example.clozeTarget);
  const surface = example.sentence.slice(span.start, span.end);
  const shape = surfaceShape(surface, target.lemmaKey, target.pos);
  // With an article right before the blank, the blank takes it in: "___ pear"
  // after "an" would give the answer away (`an ___` -> a vowel).
  const article = span.article;
  const withArticle = (form: string) =>
    article ? `${matchInitialCase(articleFor(form), article.text)} ${form}` : form;
  const asOption = (form: string) => withArticle(matchInitialCase(form, surface));

  // The sentence's own article for the answer; distractors get theirs by spelling.
  const correct = article ? `${article.text} ${surface}` : surface;
  const distractors = pickFor(input, rng, correct, (l) => {
    const form = formWithShape(l, shape);
    return form === null ? null : asOption(form);
  });
  if (distractors.length < DISTRACTOR_COUNT) return null;

  const gapStart = article ? article.start : span.start;
  const sentence = `${example.sentence.slice(0, gapStart)}${PRACTICE_GAP}${example.sentence.slice(span.end)}`;
  return choice({ mode: 'cloze', sentence }, correct, distractors, rng);
}

/**
 * A surface form of `lexeme` in `shape`: its lemma for the base form,
 * otherwise a cloze target of its own examples with the same shape — never a
 * guessed inflection.
 */
function formWithShape(lexeme: VocabLexeme, shape: SurfaceShape): string | null {
  if (shape === 'base') return lexeme.lemma;
  for (const ex of lexeme.examples) {
    if (surfaceShape(ex.clozeTarget, lexeme.lemmaKey, lexeme.pos) === shape) return ex.clozeTarget;
  }
  return null;
}

function pickFor(
  input: VocabCardInput,
  rng: Rng,
  targetOption: string,
  optionOf: (l: VocabLexeme) => string | null,
): string[] {
  const picked = pickDistractors({
    target: input.target,
    pool: input.pool,
    locale: input.locale,
    rng,
    optionOf,
    targetOption,
  });
  return picked.map((d) => d.option);
}

type ChoiceView = Extract<VocabCardView, { options: string[] }>;
/** A choice view without its options (distributive, one per mode). */
type ChoicePrompt = ChoiceView extends infer V
  ? V extends ChoiceView
    ? Omit<V, 'options'>
    : never
  : never;

function choice(prompt: ChoicePrompt, correct: string, distractors: string[], rng: Rng): VocabCard {
  if (distractors.length < DISTRACTOR_COUNT) {
    throw new VocabCardError(`only ${distractors.length} distractors (${prompt.mode})`);
  }
  const options = shuffle([correct, ...distractors], rng);
  return {
    view: { ...prompt, options } as ChoiceView,
    key: { kind: 'choice', mode: prompt.mode, correctIndex: options.indexOf(correct) },
  };
}
