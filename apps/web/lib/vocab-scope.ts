import { VocabCollectionValue } from '@englishlearn/db/vocab/collections';
import { LexemeSlugSchema } from '@englishlearn/db/vocab/slug';
import { parseVocabConceptId } from '@englishlearn/db/vocab/topics';
import type { VocabSessionScope } from '@englishlearn/learner-model/service';
import { z } from 'zod';

/**
 * A vocabulary session's scope as the client may name it (B6.2): one topic
 * concept (`vocab.<topic>.<level>`) or one browsing collection. Scope narrows
 * NEW words only; due reviews stay global (B6-SPEC V2-5).
 */
export const VocabScopeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('concept'),
      conceptId: z
        .string()
        .max(100)
        .refine((id) => parseVocabConceptId(id) !== null),
    })
    .strict(),
  z.object({ kind: z.literal('collection'), key: VocabCollectionValue }).strict(),
]) satisfies z.ZodType<VocabSessionScope>;

/** A scope the client can send (a collection key from the closed taxonomy). */
export type ClientVocabScope = z.infer<typeof VocabScopeSchema>;

/**
 * `/words/practice?concept=…` or `?collection=…`. Anything else (unknown,
 * repeated, both at once) is the whole pool.
 */
export function scopeFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): ClientVocabScope | undefined {
  const { concept, collection } = params;
  if (concept !== undefined && collection !== undefined) return undefined;
  const parsed = VocabScopeSchema.safeParse(
    typeof concept === 'string'
      ? { kind: 'concept', conceptId: concept }
      : typeof collection === 'string'
        ? { kind: 'collection', key: collection }
        : null,
  );
  return parsed.success ? parsed.data : undefined;
}

/**
 * `/words/practice?prove=<slug>` (B6.6): "I know" on a word page — the
 * session opens on that word's proof. Only a well-formed public slug, once;
 * anything else starts the session as usual.
 */
export function proveSlugFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): string | undefined {
  const parsed = LexemeSlugSchema.safeParse(params.prove);
  return parsed.success ? parsed.data : undefined;
}
