import type { PartOfSpeechValue } from '@englishlearn/db/schemas';
import type { CEFRLevel } from '../core/graph/types';
import { glossOf } from './text';
import type { VocabLexeme, VocabLocale } from './types';
import { atLeastB1, rotatedExample } from './variants/shared';

/**
 * The intro card of a new word (mode 0, B6.5 / V2-11): shown once before its
 * first question, with no options, no key and nothing recorded. It names the
 * word — that is its point — so it is never served for a word already
 * answered, and its reference cannot be answered (the web rejects it).
 */

/** At most this many collocations on the card. */
export const INTRO_COLLOCATIONS = 2;

export type VocabIntroView = {
  word: string;
  pos: PartOfSpeechValue;
  ipa: string | null;
  /**
   * Below B1: the gloss in the learner's language. B1+ (or a learner with no
   * gloss language, `en`): the English definition — `kind` says which, so the
   * text can be marked up as English.
   */
  meaning: { kind: 'gloss' | 'definition'; text: string };
  /** The example the card seed rotates to (as cloze does), with its translation. */
  example: { sentence: string; translation: string | null } | null;
  /** The first INTRO_COLLOCATIONS collocations, as stored. */
  collocations: string[];
};

export function buildVocabIntro(
  target: VocabLexeme,
  ctx: { locale: VocabLocale; learnerLevel: CEFRLevel | null; seed: string },
): VocabIntroView {
  const definition = target.definitions.en;
  const text = atLeastB1(ctx.learnerLevel) ? definition : glossOf(target, ctx.locale);
  const example = rotatedExample(target, ctx.seed);
  return {
    word: target.lemma,
    pos: target.pos,
    ipa: target.ipa ?? null,
    meaning: { kind: text === definition ? 'definition' : 'gloss', text },
    example: example
      ? {
          sentence: example.sentence,
          translation: ctx.locale === 'en' ? null : (example.translation[ctx.locale] ?? null),
        }
      : null,
    collocations: (target.collocations ?? []).slice(0, INTRO_COLLOCATIONS),
  };
}
