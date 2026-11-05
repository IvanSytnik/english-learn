import { describe, expect, it } from 'vitest';
import { LexemePreferenceState, WordListSource } from '../../generated/client/enums';
import {
  LexemePreferenceStateSchema,
  WordListNoteSchema,
  WordListPositionSchema,
  WordListSourceSchema,
  WordListTitleSchema,
} from '../word-list';

describe('word list schemas (B6.6)', () => {
  it('mirror the Prisma enums', () => {
    expect(LexemePreferenceStateSchema.options).toEqual(Object.values(LexemePreferenceState));
    expect(WordListSourceSchema.options).toEqual(Object.values(WordListSource));
  });

  it('title: trimmed, 1..80 characters, like the CHECK', () => {
    expect(WordListTitleSchema.parse('  Travel  ')).toBe('Travel');
    expect(WordListTitleSchema.safeParse('x'.repeat(80)).success).toBe(true);
    expect(WordListTitleSchema.safeParse('x'.repeat(81)).success).toBe(false);
    expect(WordListTitleSchema.safeParse('   ').success).toBe(false);
    expect(WordListTitleSchema.safeParse('').success).toBe(false);
  });

  it('note: <= 200 characters, empty clears it', () => {
    expect(WordListNoteSchema.parse('x'.repeat(200))).toHaveLength(200);
    expect(WordListNoteSchema.safeParse('x'.repeat(201)).success).toBe(false);
    expect(WordListNoteSchema.parse('  ')).toBeNull();
  });

  it('position: a non-negative integer', () => {
    expect(WordListPositionSchema.safeParse(0).success).toBe(true);
    expect(WordListPositionSchema.safeParse(-1).success).toBe(false);
    expect(WordListPositionSchema.safeParse(1.5).success).toBe(false);
  });
});
