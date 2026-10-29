import type { PartOfSpeechValue } from '@englishlearn/db/schemas';
import type { CEFRLevel } from '../../core/graph/types';
import type { VocabExample, VocabLexeme } from '../types';

/** A test lexeme: `id` = `lx.<lemma>`, gloss `<lemma>-ru` unless given. */
export function lex(
  lemma: string,
  opts: {
    pos?: PartOfSpeechValue;
    level?: CEFRLevel;
    concept?: string;
    ru?: string;
    uk?: string;
    de?: string;
    en?: string;
    examples?: VocabExample[];
    variants?: string[];
    id?: string;
  } = {},
): VocabLexeme {
  const level = opts.level ?? 'A1';
  return {
    id: opts.id ?? `lx.${lemma}`,
    lemma,
    lemmaKey: lemma.trim().toLowerCase(),
    pos: opts.pos ?? 'NOUN',
    cefrLevel: level,
    conceptId: opts.concept ?? `vocab.food.${level.toLowerCase()}`,
    definitions: { en: opts.en ?? `meaning of ${lemma}` },
    translations: {
      ru: opts.ru ?? `${lemma}-ru`,
      uk: opts.uk ?? `${lemma}-uk`,
      de: opts.de ?? `${lemma}-de`,
    },
    examples: opts.examples ?? [
      { sentence: `I see the ${lemma} here.`, translation: { ru: 'x' }, clozeTarget: lemma },
    ],
    variants: opts.variants ?? [],
  };
}

export const example = (sentence: string, clozeTarget: string): VocabExample => ({
  sentence,
  translation: { ru: 'x', uk: 'x', de: 'x' },
  clozeTarget,
});
