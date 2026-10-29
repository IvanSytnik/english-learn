import { z } from 'zod';
import type { PrismaClient } from '../generated/client/client';
import { LexemeItemContentSchema } from '../schemas/items/lexeme-item';
import type { CefrLevelValue } from '../schemas/learner-events';
import {
  LexemeExampleSchema,
  type PartOfSpeechValue,
  TranslationMapSchema,
} from '../schemas/lexeme';

/**
 * The published vocabulary as the card builder needs it (B2.6): every
 * PUBLISHED VOCAB_WORD item on a PUBLISHED lexeme, joined into one row — the
 * lexeme's text, the item's topic concept and spelling variants. Server-only:
 * the rows are answer keys. The shape matches learner-model's VocabLexeme
 * (`id` = lexeme id) plus the item id.
 *
 * vocab:publish validates every lexeme before it publishes, so a row that
 * does not parse here means hand-edited data: it is left out (and reported
 * in `invalidItemIds`) rather than taking the whole session down.
 */

export type VocabLexemeRow = {
  itemId: string;
  /** Lexeme id. */
  id: string;
  lemma: string;
  lemmaKey: string;
  pos: PartOfSpeechValue;
  cefrLevel: CefrLevelValue;
  conceptId: string;
  ipa: string | null;
  definitions: { en: string };
  translations: z.infer<typeof TranslationMapSchema>;
  examples: z.infer<typeof LexemeExampleSchema>[];
  variants: string[];
};

const RowJsonSchema = z.object({
  definitions: z.object({ en: z.string().trim().min(1) }),
  translations: TranslationMapSchema,
  examples: z.array(LexemeExampleSchema).min(1),
  content: LexemeItemContentSchema,
});

export async function getPublishedVocabLexemes(
  db: Pick<PrismaClient, 'item'>,
): Promise<{ rows: VocabLexemeRow[]; invalidItemIds: string[] }> {
  const items = await db.item.findMany({
    where: {
      kind: 'VOCAB_WORD',
      status: 'PUBLISHED',
      lexemeId: { not: null },
      lexeme: { status: 'PUBLISHED' },
    },
    select: {
      id: true,
      conceptId: true,
      content: true,
      lexeme: {
        select: {
          id: true,
          lemma: true,
          lemmaKey: true,
          pos: true,
          cefrLevel: true,
          ipa: true,
          definitions: true,
          translations: true,
          examples: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  const rows: VocabLexemeRow[] = [];
  const invalidItemIds: string[] = [];
  for (const item of items) {
    const lexeme = item.lexeme;
    const json = lexeme && RowJsonSchema.safeParse({ ...lexeme, content: item.content });
    if (!lexeme || !json?.success) {
      invalidItemIds.push(item.id);
      continue;
    }
    rows.push({
      itemId: item.id,
      id: lexeme.id,
      lemma: lexeme.lemma,
      lemmaKey: lexeme.lemmaKey,
      pos: lexeme.pos,
      cefrLevel: lexeme.cefrLevel,
      conceptId: item.conceptId,
      ipa: lexeme.ipa,
      definitions: { en: json.data.definitions.en },
      translations: json.data.translations,
      examples: json.data.examples,
      variants: json.data.content.variants,
    });
  }
  return { rows, invalidItemIds };
}
