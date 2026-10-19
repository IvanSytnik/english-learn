import type { Locale } from './locale';
import { LocalizedStringSchema, localized } from './localized-string';

/**
 * Concept.title (jsonb, nullable): the learner-facing concept name in each
 * interface locale. `Concept.name` stays the English admin/technical label and
 * is the fallback whenever `title` is null or fails validation.
 */
export const ConceptTitleSchema = LocalizedStringSchema;

/**
 * Resolve a concept's display title for `locale`.
 *
 * Fallback chain: title[locale] → title.en → concept.name. Never throws — a
 * malformed title (schema drift, hand-edited row) degrades to `name` instead
 * of breaking a learner page.
 */
export function getConceptTitle(
  concept: { readonly name: string; readonly title: unknown },
  locale: Locale,
): string {
  const parsed = ConceptTitleSchema.safeParse(concept.title);
  return parsed.success ? localized(parsed.data, locale) : concept.name;
}
