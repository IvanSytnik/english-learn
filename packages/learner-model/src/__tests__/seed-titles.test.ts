import { ConceptTitleSchema, SUPPORTED_LOCALES } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { SEED_CONCEPTS } from '../../seed';
import { CONCEPT_TITLES } from '../../seed/concepts/titles';

describe('seed concept titles (E6)', () => {
  it('every seed concept has a valid title in all four locales', () => {
    for (const concept of SEED_CONCEPTS) {
      const title = CONCEPT_TITLES[concept.id];
      expect(title, concept.id).toBeDefined();
      expect(ConceptTitleSchema.safeParse(title).success, concept.id).toBe(true);
      for (const locale of SUPPORTED_LOCALES) {
        expect(title?.[locale]?.trim(), `${concept.id}.${locale}`).toBeTruthy();
      }
    }
  });

  it('has no titles for concepts that are not seeded', () => {
    const ids = new Set(SEED_CONCEPTS.map((c) => c.id));
    expect(Object.keys(CONCEPT_TITLES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('uses real Ukrainian letters, not Russian look-alikes, in uk titles', () => {
    for (const [id, title] of Object.entries(CONCEPT_TITLES)) {
      // ы, э, ъ, ё do not exist in Ukrainian.
      expect(title.uk ?? '', id).not.toMatch(/[ыэъё]/i);
    }
  });
});
