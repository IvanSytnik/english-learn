import { z } from 'zod';
import { CefrLevelValue } from './learner-events';
import { LocalizedStringSchema } from './localized-string';

/**
 * Lexeme — a dictionary entry (see the Lexeme model in schema.prisma).
 *
 * The database keeps the structural rules as raw-SQL CHECKs (migration
 * 20261029180000_add_lexeme_model); the schemas here are their JS twins plus
 * the JSON shapes the database cannot check.
 */

export const PartOfSpeechSchema = z.enum([
  'NOUN',
  'VERB',
  'ADJECTIVE',
  'ADVERB',
  'PRONOUN',
  'PREPOSITION',
  'CONJUNCTION',
  'PHRASAL_VERB',
  'IDIOM',
  'INTERJECTION',
  'OTHER',
]);
export type PartOfSpeechValue = z.infer<typeof PartOfSpeechSchema>;

export const ContentStatusSchema = z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED', 'REJECTED']);
export type ContentStatusValue = z.infer<typeof ContentStatusSchema>;

/**
 * CEFR-J levels (CHECK Lexeme_cefrJLevel_valid): the sublevels, plus the whole
 * levels A1–B2 the CEFR-J Wordlist uses (migration
 * 20261029200000_accept_whole_cefrj_levels).
 */
export const CefrJLevelSchema = z.enum([
  'PreA1',
  'A1',
  'A1.1',
  'A1.2',
  'A1.3',
  'A2',
  'A2.1',
  'A2.2',
  'B1',
  'B1.1',
  'B1.2',
  'B2',
  'B2.1',
  'B2.2',
  'C1',
  'C2',
]);
export type CefrJLevelValue = z.infer<typeof CefrJLevelSchema>;

/** The CEFR level a CEFR-J level sits in (CHECK Lexeme_cefrJLevel_matches_cefrLevel). */
export function cefrLevelOf(level: CefrJLevelValue): CefrLevelValue {
  return level === 'PreA1' ? 'A1' : (level.slice(0, 2) as CefrLevelValue);
}

/** The comparison key behind the unique index (CHECK Lexeme_lemmaKey_normalized). */
export function lexemeKey(lemma: string): string {
  return lemma.trim().toLowerCase();
}

/**
 * Translation of English text into the learner languages. Unlike
 * LocalizedString there is no `en`: the source text is English already.
 */
export const TranslationMapSchema = z
  .object({
    ru: z.string().trim().min(1).optional(),
    uk: z.string().trim().min(1).optional(),
    de: z.string().trim().min(1).optional(),
  })
  .strict()
  .refine((map) => Object.values(map).some(Boolean), 'At least one translation is required');
export type TranslationMap = z.infer<typeof TranslationMapSchema>;

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** The code point that ends just before `index`, or '' at the start. */
const charBefore = (text: string, index: number) =>
  index <= 0 ? '' : (Array.from(text.slice(Math.max(0, index - 2), index)).at(-1) ?? '');
const charAt = (text: string, index: number) => {
  const code = text.codePointAt(index);
  return code === undefined ? '' : String.fromCodePoint(code);
};

/**
 * Occurrences of `target` in `sentence` as a whole word, case-insensitive,
 * non-overlapping. A scan rather than a regex built from the target: a fresh
 * Unicode regex per call cost ~0.3 ms, seconds over the whole vocabulary.
 */
export function countWholeWord(sentence: string, target: string): number {
  const haystack = sentence.toLowerCase();
  const needle = target.toLowerCase();
  if (needle.length === 0) return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    const bounded =
      !WORD_CHAR.test(charBefore(haystack, i)) &&
      !WORD_CHAR.test(charAt(haystack, i + needle.length));
    if (bounded) count += 1;
    i = haystack.indexOf(needle, bounded ? i + needle.length : i + 1);
  }
  return count;
}

/**
 * One example sentence. `clozeTarget` is the surface form to blank out — it
 * may differ from the lemma ("ran" for "run") and must occur in the sentence
 * exactly once, or the cloze would be ambiguous.
 */
export const LexemeExampleSchema = z
  .object({
    sentence: z.string().trim().min(1),
    translation: TranslationMapSchema,
    clozeTarget: z.string().trim().min(1),
  })
  .strict()
  .refine((ex) => countWholeWord(ex.sentence, ex.clozeTarget) === 1, {
    message: 'clozeTarget must occur in the sentence exactly once, as a whole word',
    path: ['clozeTarget'],
  });
export type LexemeExample = z.infer<typeof LexemeExampleSchema>;

const lexemeFields = {
  lemma: z.string().trim().min(1),
  pos: PartOfSpeechSchema,
  sense: z.string().trim().default(''),
  cefrLevel: CefrLevelValue,
  cefrJLevel: CefrJLevelSchema,
  ipa: z.string().trim().min(1).nullish(),
  audioUrl: z.url().nullish(),
  definitions: LocalizedStringSchema,
  translations: TranslationMapSchema,
  examples: z.array(LexemeExampleSchema).default([]),
  collocations: z.array(z.string().trim().min(1)).default([]),
  frequencyRank: z.number().int().positive().nullish(),
  status: ContentStatusSchema.default('DRAFT'),
};

const levelsAgree = (lexeme: { cefrLevel: CefrLevelValue; cefrJLevel: CefrJLevelValue }) =>
  cefrLevelOf(lexeme.cefrJLevel) === lexeme.cefrLevel;
const levelsMessage = { message: 'cefrJLevel must sit inside cefrLevel', path: ['cefrJLevel'] };

/** A stored lexeme row (the JSON columns parsed). */
export const LexemeSchema = z
  .object({ id: z.string().min(1), lemmaKey: z.string().min(1), ...lexemeFields })
  .strict()
  .refine(levelsAgree, levelsMessage)
  .refine((lexeme) => lexeme.lemmaKey === lexemeKey(lexeme.lemma), {
    message: 'lemmaKey must equal the normalized lemma',
    path: ['lemmaKey'],
  });
export type LexemeRecord = z.infer<typeof LexemeSchema>;

/** Input for creating a lexeme: `lemmaKey` is derived, never supplied. */
export const CreateLexemeInputSchema = z
  .object(lexemeFields)
  .strict()
  .refine(levelsAgree, levelsMessage)
  .transform((input) => ({ ...input, lemmaKey: lexemeKey(input.lemma) }));
export type CreateLexemeInput = z.input<typeof CreateLexemeInputSchema>;
export type CreateLexemeData = z.output<typeof CreateLexemeInputSchema>;

const empty = z.object({}).strict();

/**
 * Input for an imported DRAFT lexeme that has no gloss yet: `definitions` and
 * `translations` may be `{}` (the translation pipeline fills them). Only a
 * DRAFT may be incomplete — a lexeme goes to REVIEW or PUBLISHED as a full
 * LexemeSchema row.
 */
export const CreateDraftLexemeInputSchema = z
  .object({
    ...lexemeFields,
    definitions: z.union([LocalizedStringSchema, empty]),
    translations: z.union([TranslationMapSchema, empty]),
    status: z.literal('DRAFT').default('DRAFT'),
  })
  .strict()
  .refine(levelsAgree, levelsMessage)
  .transform((input) => ({ ...input, lemmaKey: lexemeKey(input.lemma) }));
export type CreateDraftLexemeInput = z.input<typeof CreateDraftLexemeInputSchema>;
export type CreateDraftLexemeData = z.output<typeof CreateDraftLexemeInputSchema>;
