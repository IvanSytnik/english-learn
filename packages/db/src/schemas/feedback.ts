import { z } from 'zod';
import { PracticeModeSchema } from './learner-events';

/** Mirrors Prisma enum FeedbackKind. Keep in sync with schema.prisma. */
export const FeedbackKindSchema = z.enum(['CONTENT_ERROR', 'BUG', 'SUGGESTION', 'OTHER']);
export type FeedbackKindValue = z.infer<typeof FeedbackKindSchema>;

/** Cap on the serialized `metadata`, in UTF-8 bytes (not UTF-16 code units). */
export const METADATA_MAX_BYTES = 4096;

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/**
 * What the feedback form may send. `userId` is deliberately absent: it comes
 * from the session on the server, never from the client.
 */
export const CreateBetaFeedbackSchema = z.object({
  text: z.string().trim().min(5).max(1000),
  kind: FeedbackKindSchema.default('CONTENT_ERROR'),
  url: z.string().min(1).max(2000),
  itemId: z.string().trim().min(1).nullable().optional(),
  conceptId: z.string().trim().min(1).nullable().optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional()
    .refine((val) => !val || jsonBytes(val) <= METADATA_MAX_BYTES, {
      message: 'Metadata payload must not exceed 4KB',
    }),
});

export type CreateBetaFeedbackInput = z.input<typeof CreateBetaFeedbackSchema>;
export type CreateBetaFeedback = z.output<typeof CreateBetaFeedbackSchema>;

/**
 * BetaFeedback.metadata for a report about a word ("report error" in the
 * vocabulary player): which lexeme, as shown, in which practice mode. Lives
 * in the free-form `metadata` (no migration); the action builds it on the
 * server, the client never supplies the lexeme id.
 */
export const VocabFeedbackMetadataSchema = z
  .object({
    lexemeId: z.string().trim().min(1),
    lemma: z.string().trim().min(1).max(100),
    vocabMode: PracticeModeSchema,
  })
  .strict();
export type VocabFeedbackMetadata = z.infer<typeof VocabFeedbackMetadataSchema>;

/** The vocabulary context of a stored feedback row, or null if it has none (or a malformed one). */
export function parseVocabFeedbackMetadata(metadata: unknown): VocabFeedbackMetadata | null {
  const parsed = VocabFeedbackMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}
