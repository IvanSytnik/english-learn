import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createLearnerService } from '../learner-service';
import { createSelectionService } from '../selection-service';
import { createMemoryDb, type MemoryItem } from './memory-db';

/**
 * Pool isolation (Axiom 6, B2.5): vocabulary answers never change what
 * grammar selection serves. Same seed, same clock — selectNext returns the
 * same outcome before and after any run of vocabulary outcomes, on both
 * level-aware paths: the diagnostic's start concept (no grammar practice yet)
 * and the level guard's θ (after grammar practice). Vocabulary concepts carry
 * CEFR levels at the learner's target level, so a leak would move θ or end
 * the start concept.
 */

const USER = 'user_1';
const T0 = 1_750_000_000_000;
const MINUTE = 60_000;

const grammar = (conceptId: string, b: number): MemoryItem => ({
  conceptId,
  irtDiscrimination: 1,
  irtDifficulty: b,
});
const vocab = (conceptId: string): MemoryItem => ({
  conceptId,
  irtDiscrimination: 1,
  irtDifficulty: 0,
  pool: 'vocab',
});

const ITEMS: Record<string, MemoryItem> = {
  'g.a2.1': grammar('g.a2', -1),
  'g.b1.1': grammar('g.b1', 0),
  'g.b1.2': grammar('g.b1', 0.2),
  'g.b2.1': grammar('g.b2', 1),
  'v.food.b1.1': vocab('vocab.food.b1'),
  'v.food.b1.2': vocab('vocab.food.b1'),
  'v.home.a2.1': vocab('vocab.home.a2'),
};
const VOCAB_ITEMS = Object.keys(ITEMS).filter((id) => ITEMS[id]?.pool === 'vocab');
const CONCEPTS = [
  { id: 'g.a2', cefrLevel: 'A2' },
  { id: 'g.b1', cefrLevel: 'B1' },
  { id: 'g.b2', cefrLevel: 'B2' },
  { id: 'vocab.food.b1', cefrLevel: 'B1' },
  { id: 'vocab.home.a2', cefrLevel: 'A2' },
] as const;

const vocabAnswer = fc.record({
  item: fc.constantFrom(...VOCAB_ITEMS),
  correct: fc.boolean(),
  mode: fc.constantFrom('recognition', 'cloze', 'recall'),
});

describe('grammar selection ignores vocabulary outcomes (Axiom 6)', () => {
  it.each([
    ['the start concept (no grammar practice)', 0],
    ['the level guard θ (after grammar practice)', 4],
  ])('%s', async (_, grammarAnswers) => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(vocabAnswer, { minLength: 1, maxLength: 12 }),
        fc.array(fc.boolean(), { minLength: grammarAnswers, maxLength: grammarAnswers }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        async (vocabAnswers, grammarCorrect, seed) => {
          const { db } = createMemoryDb({
            items: ITEMS,
            assessedLevels: { [USER]: 'B1' },
            concepts: [...CONCEPTS],
          });
          const learner = createLearnerService(db);
          const selection = createSelectionService(db);
          let at = T0;
          for (const correct of grammarCorrect) {
            at += MINUTE;
            await learner.recordOutcome({
              userId: USER,
              itemId: 'g.b1.1',
              correct,
              occurredAtMs: BigInt(at),
            });
          }
          const nowMs = T0 + 1000 * MINUTE;
          const before = await selection.selectNext({ userId: USER, nowMs, seed });

          for (const a of vocabAnswers) {
            at += MINUTE;
            const result = await learner.recordVocabOutcome({
              userId: USER,
              itemId: a.item,
              correct: a.correct,
              mode: a.mode,
              occurredAtMs: BigInt(at),
            });
            expect(result.ok).toBe(true);
          }

          expect(await selection.selectNext({ userId: USER, nowMs, seed })).toEqual(before);
        },
      ),
      { numRuns: 150 },
    );
  });
});
