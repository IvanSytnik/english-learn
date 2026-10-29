import { hasPracticeQuestion } from '@englishlearn/db/queries/practisable';
import { describe, expect, it } from 'vitest';
import { SEED_EDGES } from '../../seed';
import { ALL_ITEMS } from '../../seed/items';

/**
 * V4: every PREREQUISITE parent has at least one practisable seed item.
 * Introducing a concept needs its direct parents at mastery >= 0.7, and
 * mastery only moves through outcomes on practisable items — a parent with
 * none would lock its children forever. hasPractice is computed the way
 * seed:items writes it (all seed items are PUBLISHED).
 */

describe('prerequisite practisability (V4)', () => {
  const practisable = new Set(
    ALL_ITEMS.filter((i) => hasPracticeQuestion(i.content)).map((i) => i.conceptId),
  );
  const parents = [
    ...new Set(SEED_EDGES.filter((e) => e.kind === 'PREREQUISITE').map((e) => e.from)),
  ];

  it('the seed graph has PREREQUISITE edges', () => {
    expect(parents.length).toBeGreaterThan(0);
  });

  it('every PREREQUISITE parent has a practisable item', () => {
    expect(parents.filter((id) => !practisable.has(id))).toEqual([]);
  });
});
