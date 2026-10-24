import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exercisesFallback } from '@/lib/exercise/fallback';
import en from '../../messages/en.json';

describe('exercisesFallback (nothing to practise)', () => {
  it('before the diagnostic: points at the diagnostic', () => {
    expect(exercisesFallback(false)).toEqual({
      text: 'comingSoon',
      cta: 'startDiagnostic',
      href: '/diagnostic',
    });
  });

  it('after the diagnostic: never back to /diagnostic, whose result leads here (no loop)', () => {
    const f = exercisesFallback(true);
    expect(f.href).not.toBe('/diagnostic');
    expect(f).toEqual({ text: 'noExercisesYet', cta: 'toDashboard', href: '/dashboard' });
  });

  it('every branch names real messages', () => {
    for (const f of [exercisesFallback(false), exercisesFallback(true)]) {
      expect(en.student.exercises[f.text]).toBeTruthy();
      expect(en.student.exercises[f.cta]).toBeTruthy();
    }
  });
});

describe('one "done" signal for the diagnostic CTAs', () => {
  // /diagnostic shows the result for a COMPLETED attempt; a CTA asking
  // anything else (e.g. the LEARNER_BOOTSTRAPPED event) can disagree with it
  // and loop the learner between /exercises and /diagnostic.
  const pages = [
    'app/[locale]/(student)/dashboard/page.tsx',
    'app/[locale]/(student)/exercises/page.tsx',
  ];
  for (const page of pages) {
    it(`${page} asks isDiagnosticDone, not the bootstrap event`, () => {
      const source = readFileSync(join(process.cwd(), page), 'utf8');
      expect(source).toContain('isDiagnosticDone(');
      expect(source).not.toContain('hasLearnerBootstrapped');
    });
  }
});
