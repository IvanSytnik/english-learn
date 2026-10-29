import { describe, expect, it } from 'vitest';

import { DiagnosticContentSchema } from '../diagnostic';

describe('DiagnosticContentSchema', () => {
  const valid = {
    source: {
      stem: 'Choose the correct form: I ___ to school every day.',
      choices: ['go', 'goes', 'going', 'went'],
      correctIndex: 0,
    },
  };

  it('accepts minimal payload (no localized)', () => {
    expect(DiagnosticContentSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts payload with localized explanation', () => {
    const withExpl = {
      ...valid,
      localized: { explanation: { en: 'Present Simple, 1st person singular.' } },
    };
    expect(DiagnosticContentSchema.safeParse(withExpl).success).toBe(true);
  });

  it('rejects correctIndex out of range', () => {
    const bad = { source: { ...valid.source, correctIndex: 99 } };
    expect(DiagnosticContentSchema.safeParse(bad).success).toBe(false);
  });
});
