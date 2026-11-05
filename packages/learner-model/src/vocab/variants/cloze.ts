import { PRACTICE_GAP, VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { DISTRACTOR_COUNT } from '../distractors';
import {
  articleFor,
  findClozeSpan,
  matchInitialCase,
  type SurfaceShape,
  surfaceShape,
} from '../text';
import type { VocabLexeme } from '../types';
import { cardRng, choice, gradeChoice, pickFor, rotatedExample, VocabCardError } from './shared';
import type { VocabBuildInput, VocabCard, VocabRungVariant } from './types';

/**
 * Mode 3 (7 ≤ S < 21): a sentence with a gap, choose what fills it. The
 * sentence is one of the word's examples, rotated by card seed (B6.5). A
 * blank whose form no three other words share (`kind-hearted`) is no fair
 * choice: the variant is not eligible and l1_to_en is served instead — the
 * served mode is `view.mode`, and that is what the payload records.
 */
export const cloze: VocabRungVariant<'cloze'> = {
  id: 'cloze',
  rung: 'cloze',
  payloadMode: VOCAB_VARIANT_MODE.cloze,
  ladderFrom: 7,
  keyKind: 'choice',
  eligible: (target, ctx) => clozeCard({ ...ctx, target }) !== null,
  fallback: 'l1_to_en',
  build(input) {
    const card = clozeCard(input);
    if (!card) throw new VocabCardError(`"${input.target.lemma}" has no fair cloze`);
    return card;
  },
  grade: gradeChoice,
};

/** Null when fewer than three other words share the blank's form. */
function clozeCard(input: VocabBuildInput): VocabCard | null {
  const { target } = input;
  const rng = cardRng(input, 'cloze');
  // Rotates over the word's examples by card seed (B6.5); one example → it.
  const example = rotatedExample(target, input.seed);
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
  return choice(
    { mode: 'cloze', sentence },
    { option: correct, lexemeId: target.id },
    distractors,
    rng,
  );
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
