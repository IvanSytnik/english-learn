import { describe, expect, it } from 'vitest';
import { hasPracticeQuestion } from '../practisable';

/**
 * hasPracticeQuestion is the JS twin of Item_hasPractice_matches_content
 * (jsonb_typeof(content -> 'practice') = 'object'): a writer that disagrees
 * with the CHECK fails on insert. item-practice-column.db.test.ts pins the
 * SQL side.
 */
describe('hasPracticeQuestion', () => {
  it('is true only for a practice object', () => {
    expect(hasPracticeQuestion({ source: {}, practice: { type: 'choice' } })).toBe(true);
    expect(hasPracticeQuestion({ practice: {} })).toBe(true);
  });

  it.each([
    ['missing practice', { source: {} }],
    ['JSON-null practice', { practice: null }],
    ['array practice', { practice: [] }],
    ['string practice', { practice: 'x' }],
    ['number practice', { practice: 1 }],
    ['null content', null],
    ['scalar content', 'practice'],
  ])('is false for %s', (_, content) => {
    expect(hasPracticeQuestion(content)).toBe(false);
  });
});
