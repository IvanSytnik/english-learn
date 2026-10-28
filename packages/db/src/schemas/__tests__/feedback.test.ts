import { describe, expect, it } from 'vitest';
import { CreateBetaFeedbackSchema, METADATA_MAX_BYTES } from '../feedback';

describe('CreateBetaFeedbackSchema', () => {
  const valid = { text: 'Wrong answer key', url: '/en/exercises' };

  it('trims the text and defaults kind to CONTENT_ERROR', () => {
    expect(CreateBetaFeedbackSchema.parse({ ...valid, text: '  Wrong answer key  ' })).toEqual({
      ...valid,
      kind: 'CONTENT_ERROR',
    });
  });

  it('bounds the text to 5..1000 characters after trimming', () => {
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, text: '  abcd   ' }).success).toBe(false);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, text: 'abcde' }).success).toBe(true);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, text: 'a'.repeat(1000) }).success).toBe(
      true,
    );
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, text: 'a'.repeat(1001) }).success).toBe(
      false,
    );
  });

  it('rejects an unknown kind, an empty url and blank ids', () => {
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, kind: 'SPAM' }).success).toBe(false);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, url: '' }).success).toBe(false);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, itemId: '   ' }).success).toBe(false);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, conceptId: '' }).success).toBe(false);
  });

  it('accepts null optional fields and object metadata only', () => {
    const nulls = { ...valid, itemId: null, conceptId: null, metadata: null };
    expect(CreateBetaFeedbackSchema.safeParse(nulls).success).toBe(true);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, metadata: { a: 1 } }).success).toBe(true);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, metadata: [1] }).success).toBe(false);
  });

  it('caps serialized metadata at 4KB, counted in UTF-8 bytes', () => {
    // {"k":"…"} is 8 bytes of JSON around the value.
    const ascii = (n: number) => ({ k: 'a'.repeat(n - 8) });
    expect(
      CreateBetaFeedbackSchema.safeParse({ ...valid, metadata: ascii(METADATA_MAX_BYTES) }).success,
    ).toBe(true);
    expect(
      CreateBetaFeedbackSchema.safeParse({ ...valid, metadata: ascii(METADATA_MAX_BYTES + 1) })
        .success,
    ).toBe(false);

    // 2100 Cyrillic letters: ~2.1K UTF-16 units but ~4.2KB on the wire.
    const cyrillic = { k: '\u0436'.repeat(2100) };
    expect(JSON.stringify(cyrillic).length).toBeLessThan(METADATA_MAX_BYTES);
    expect(CreateBetaFeedbackSchema.safeParse({ ...valid, metadata: cyrillic }).success).toBe(
      false,
    );
  });
});
