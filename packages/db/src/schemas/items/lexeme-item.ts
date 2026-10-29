import { z } from 'zod';

/**
 * Item.content of a lexeme-backed VOCAB_WORD item (written by vocab:publish).
 *
 * Not one of the authored kind schemas (`parseItemContent`): the question is
 * built at serve time from the Lexeme, so localization fixes reach learners at
 * once. The item keeps only what grading needs and the Lexeme lacks — the
 * spelling variants (`behavior` / `behaviour`) from the CEFR-J dataset. Never
 * a `practice` key: Item_lexeme_not_practisable keeps hasPractice false.
 * Server-only (an answer key).
 */
export const LexemeItemContentSchema = z
  .object({
    /** The lexeme's display lemma at publish time. */
    headword: z.string().trim().min(1),
    /** Other accepted spellings, without the headword itself. */
    variants: z.array(z.string().trim().min(1)),
  })
  .strict();
export type LexemeItemContent = z.infer<typeof LexemeItemContentSchema>;
