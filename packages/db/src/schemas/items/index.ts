import { z } from "zod";
import { CollocationContentSchema } from "./collocation";
import { GrammarPatternContentSchema } from "./grammar-pattern";
import { IdiomContentSchema } from "./idiom";
import { VocabWordContentSchema } from "./vocab-word";

export { VocabWordContentSchema, type VocabWordContent } from "./vocab-word";
export {
  GrammarPatternContentSchema,
  type GrammarPatternContent,
} from "./grammar-pattern";
export { CollocationContentSchema, type CollocationContent } from "./collocation";
export { IdiomContentSchema, type IdiomContent } from "./idiom";

/** Mirrors Prisma enum ItemKind. Keep in sync with schema.prisma. */
export const ItemKindSchema = z.enum([
  "VOCAB_WORD",
  "GRAMMAR_PATTERN",
  "COLLOCATION",
  "IDIOM",
]);
export type ItemKindValue = z.infer<typeof ItemKindSchema>;

const SCHEMA_BY_KIND = {
  VOCAB_WORD: VocabWordContentSchema,
  GRAMMAR_PATTERN: GrammarPatternContentSchema,
  COLLOCATION: CollocationContentSchema,
  IDIOM: IdiomContentSchema,
} as const;

/**
 * Parse an Item.content payload with the schema matching its kind.
 * Throws ZodError on mismatch — callers on the read path should let it
 * propagate (a mismatch means DB/schema drift, which must be loud).
 */
export function parseItemContent(kind: ItemKindValue, content: unknown) {
  return SCHEMA_BY_KIND[kind].parse(content);
}

/** Non-throwing variant for validation pipelines (AI generation, admin). */
export function safeParseItemContent(kind: ItemKindValue, content: unknown) {
  return SCHEMA_BY_KIND[kind].safeParse(content);
}
