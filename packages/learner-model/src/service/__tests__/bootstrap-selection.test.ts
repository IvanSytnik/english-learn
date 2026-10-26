import { describe, expect, it } from 'vitest';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../../diagnostic';
import { pickStartConcept } from '../../diagnostic';
import { DEFAULT_POLICY_CONFIG, isMastered } from '../../policy';
import { createBootstrapService } from '../bootstrap-service';
import type { ItemForOutcome, LearnerModelDb, PrereqEdgeRow } from '../db-port';
import { createLearnerService } from '../learner-service';
import { createSelectionService } from '../selection-service';
import { createMemoryDb } from './memory-db';

/**
 * Integration: bootstrap → selectNext → recordOutcome → selectNext over ONE
 * shared in-memory store (HANDOFF gotchas 37/37a). The unit suites prove each
 * service in isolation; this proves the bootstrap rows actually reach the
 * selector and do not bypass the prerequisite gate.
 */

const ROOT = 'grammar.past_simple';
const DEPENDENT = 'grammar.past_participle';

const ITEMS: Record<string, ItemForOutcome> = {
  'item.past_simple.a': { conceptId: ROOT, irtDiscrimination: 1, irtDifficulty: 0 },
  'item.past_participle.a': { conceptId: DEPENDENT, irtDiscrimination: 1, irtDifficulty: 0 },
};

const EDGES: PrereqEdgeRow[] = [{ from: ROOT, to: DEPENDENT, kind: 'PREREQUISITE' }];

const CONCEPTS: BootstrapConcept[] = [
  { id: ROOT, category: 'GRAMMAR', cefrLevel: 'A2' },
  { id: DEPENDENT, category: 'GRAMMAR', cefrLevel: 'A2' },
];

// Perfect grammar diagnostic (ladder settles on C1) → both concepts
// bootstrapped at the 0.6 ceiling.
const ANSWERS: DiagnosticAnswerFact[] = Array.from({ length: 5 }, (_, i) => ({
  axis: 'GRAMMAR' as const,
  correct: true,
  itemLevel: 'C1' as const,
  position: i * 2,
}));

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

/** Concepts selectNext picks across many seeds at `nowMs`. */
async function conceptsPicked(db: LearnerModelDb, nowMs: number): Promise<Set<string>> {
  const svc = createSelectionService(db);
  const picked = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    const out = await svc.selectNext({ userId: 'u1', nowMs, seed });
    if (out.ok) picked.add(out.result.conceptId);
  }
  return picked;
}

describe('bootstrap → selectNext integration', () => {
  it('bootstrap rows reach the selector but do not unlock a gated dependent', async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS, edges: EDGES });
    const boot = await createBootstrapService(db).bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: BigInt(T0),
    });
    expect(boot.ok).toBe(true);
    expect(masteries.get(`u1:${DEPENDENT}`)?.observationCount).toBe(0);
    // A diagnostic prior is not practice: the ladder starts at NOT_STARTED.
    expect(masteries.get(`u1:${ROOT}`)?.displayStage).toBe('NOT_STARTED');

    // Both concepts have a bootstrap snapshot, yet only the root is selectable:
    // the dependent's prerequisite sits at the 0.6 bootstrap ceiling (< 0.7).
    expect(await conceptsPicked(db, T0 + 1000)).toEqual(new Set([ROOT]));
  });

  it('practising the prerequisite past the threshold unlocks the dependent as a new concept', async () => {
    const { db, masteries } = createMemoryDb({ items: ITEMS, edges: EDGES });
    await createBootstrapService(db).bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: BigInt(T0),
    });

    const learner = createLearnerService(db);
    // Minute-spaced reviews of the single root item: each GOOD schedules the
    // next learning step minutes ahead, so at check time nothing is due and
    // REVIEW_DUE does not mask the Thompson choice between the two concepts.
    // The gate wants pKnown ≥ 0.7 AND 3 outcomes (§8 #19): the dependent stays
    // shut until the third right answer even once pKnown has passed 0.7.
    let now = T0;
    for (
      let i = 0;
      i < 10 && !isMastered(masteries.get(`u1:${ROOT}`), DEFAULT_POLICY_CONFIG);
      i++
    ) {
      expect(await conceptsPicked(db, now + 1000)).not.toContain(DEPENDENT);
      now += MINUTE;
      const res = await learner.recordOutcome({
        userId: 'u1',
        itemId: 'item.past_simple.a',
        correct: true,
        occurredAtMs: BigInt(now),
      });
      expect(res.ok).toBe(true);
    }
    expect(masteries.get(`u1:${ROOT}`)?.pKnown).toBeGreaterThanOrEqual(0.7);
    expect(masteries.get(`u1:${ROOT}`)?.observationCount).toBe(3);
    // Ladder and gate agree: the prerequisite that unlocks a dependent is Solid.
    expect(['SOLID', 'HIGH_SOLID']).toContain(masteries.get(`u1:${ROOT}`)?.displayStage);

    const picked = await conceptsPicked(db, now + 1000);
    expect(picked.has(DEPENDENT)).toBe(true);

    const svc = createSelectionService(db);
    for (let seed = 0; seed < 64; seed++) {
      const out = await svc.selectNext({ userId: 'u1', nowMs: now + 1000, seed });
      if (out.ok && out.result.conceptId === DEPENDENT) {
        expect(out.result.reason).toBe('NEW_INTRODUCTION');
      }
    }
  });
});

describe('diagnostic → the first exercise follows the start concept', () => {
  // Two free roots on different levels and a dependent gated behind one.
  const A2 = 'vocab.daily_life';
  const B1 = 'grammar.present_perfect';
  const items: Record<string, ItemForOutcome> = {
    ...ITEMS,
    'item.daily_life.a': { conceptId: A2, irtDiscrimination: 1, irtDifficulty: 0 },
    'item.present_perfect.a': { conceptId: B1, irtDiscrimination: 1, irtDifficulty: 0 },
  };
  const concepts: BootstrapConcept[] = [
    { id: ROOT, category: 'GRAMMAR', cefrLevel: 'A2' },
    { id: DEPENDENT, category: 'GRAMMAR', cefrLevel: 'A2' },
    { id: A2, category: 'VOCAB', cefrLevel: 'A2' },
    { id: B1, category: 'GRAMMAR', cefrLevel: 'B1' },
  ];

  it('every seed serves the concept the result names, then Thompson takes over', async () => {
    const { db, masteries } = createMemoryDb({
      items,
      edges: EDGES,
      assessedLevels: { u1: 'B1' },
      concepts: concepts.map(({ id, cefrLevel }) => ({ id, cefrLevel })),
    });
    await createBootstrapService(db).bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts,
      occurredAtMs: BigInt(T0),
    });

    // What the result screen and the dashboard name.
    const named = pickStartConcept({
      concepts,
      masteries: [...masteries.entries()].map(([key, m]) => ({
        conceptId: key.slice('u1:'.length),
        pKnown: m.pKnown,
        observationCount: m.observationCount,
      })),
      prereqEdges: EDGES,
      level: 'B1',
    });
    expect(named).toBe(B1);
    expect(await conceptsPicked(db, T0 + 1000)).toEqual(new Set([B1]));

    // One answer starts it: from then on the draw decides between the roots.
    const res = await createLearnerService(db).recordOutcome({
      userId: 'u1',
      itemId: 'item.present_perfect.a',
      dontKnow: true,
      occurredAtMs: BigInt(T0 + 2000),
    });
    expect(res.ok).toBe(true);
    const after = await conceptsPicked(db, T0 + 3000);
    expect(after.size).toBeGreaterThan(1);
    expect(after.has(DEPENDENT)).toBe(false);
  });
});
