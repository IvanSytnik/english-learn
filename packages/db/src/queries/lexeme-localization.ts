import { z } from 'zod';
import type { CefrLevel, PrismaClient } from '../generated/client/client';
import { LexemeExampleSchema, TranslationMapSchema } from '../schemas/lexeme';
import { LocalizedStringSchema } from '../schemas/localized-string';

/**
 * The batch-localization writes (B2.4): which DRAFT lexemes still need a
 * gloss, and the DRAFT → REVIEW step once one is validated. Never PUBLISHED —
 * publishing follows a human spot check.
 *
 * "Still needs a gloss" is the resume checkpoint: DRAFT with translations
 * `{}`. A lexeme that failed validation stays there and is retried.
 */

export async function findLexemesToLocalize(
  db: Pick<PrismaClient, 'lexeme'>,
  options: { level?: CefrLevel } = {},
) {
  return db.lexeme.findMany({
    where: {
      status: 'DRAFT',
      translations: { equals: {} },
      ...(options.level ? { cefrLevel: options.level } : {}),
    },
    select: { id: true, lemma: true, lemmaKey: true, pos: true, sense: true, cefrLevel: true },
    orderBy: [{ cefrLevel: 'asc' }, { lemmaKey: 'asc' }, { pos: 'asc' }, { sense: 'asc' }],
  });
}

/** A validated localization, in the Lexeme column shapes. */
export const LexemeLocalizationSchema = z
  .object({
    id: z.string().min(1),
    definitions: LocalizedStringSchema,
    translations: TranslationMapSchema,
    examples: z.array(LexemeExampleSchema).min(1),
    collocations: z.array(z.string().trim().min(1)),
  })
  .strict();
export type LexemeLocalization = z.infer<typeof LexemeLocalizationSchema>;

/**
 * Writes one chunk in one transaction and moves each row DRAFT → REVIEW.
 * The write is guarded by `status = DRAFT`: a row another run already wrote,
 * or one a reviewer moved on, is left alone. Returns the rows written.
 */
export async function applyLexemeLocalizations(
  db: Pick<PrismaClient, '$transaction'>,
  localizations: readonly LexemeLocalization[],
): Promise<number> {
  const rows = localizations.map((l) => LexemeLocalizationSchema.parse(l));
  if (rows.length === 0) return 0;
  return db.$transaction(async (tx) => {
    let written = 0;
    for (const { id, ...data } of rows) {
      const result = await tx.lexeme.updateMany({
        where: { id, status: 'DRAFT' },
        data: { ...data, status: 'REVIEW' },
      });
      written += result.count;
    }
    return written;
  });
}
