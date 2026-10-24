import { describe, expect, it } from 'vitest';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../../diagnostic';
import { pickStartConcept } from '../../diagnostic';
import { createBootstrapService } from '../bootstrap-service';
import type { ItemForOutcome, LearnerModelDb, PrereqEdgeRow } from '../db-port';
import { createLearnerService } from '../learner-service';
import { replayUser } from '../replay';
import { createSelectionService } from '../selection-service';
import { createMemoryDb } from './memory-db';

/**
 * Bootstrap after practice (decision 2026-10-24): the diagnostic seeds only
 * concepts the learner has not practised yet; practised ones keep their
 * practice-derived state, on the live path and in replay alike.
 *
 *   X — practised before and after the diagnostic (prerequisite of Y)
 *   Y — never practised, gated behind X
 *   Z — never practised, no prerequisites
 */

const USER = 'u1';
const X = 'grammar.past_simple';
const Y = 'grammar.past_participle';
const Z = 'vocab.daily_life';

const ITEMS: Record<string, ItemForOutcome> = {
  'item.x': { conceptId: X, irtDiscrimination: 1, irtDifficulty: 0 },
  'item.y': { conceptId: Y, irtDiscrimination: 1, irtDifficulty: 0 },
  'item.z': { conceptId: Z, irtDiscrimination: 1, irtDifficulty: 0 },
};
const EDGES: PrereqEdgeRow[] = [{ from: X, to: Y, kind: 'PREREQUISITE' }];
const CONCEPTS: BootstrapConcept[] = [
  { id: X, category: 'GRAMMAR', cefrLevel: 'A2' },
  { id: Y, category: 'GRAMMAR', cefrLevel: 'A2' },
  { id: Z, category: 'VOCAB', cefrLevel: 'A2' },
];
// A perfect diagnostic on both axes → every bootstrapped concept at the 0.6 ceiling.
const ANSWERS: DiagnosticAnswerFact[] = (['GRAMMAR', 'VOCAB'] as const).flatMap((axis) =>
  Array.from({ length: 3 }, () => ({ axis, correct: true })),
);

// Seconds apart: X's learning step after a miss is minutes long, so right
// after the diagnostic X is not due and selection is Thompson's choice.
const SECOND = 1_000n;
const T0 = 1_750_000_000_000n;

const bootstrapAt = (db: LearnerModelDb, at: bigint) =>
  createBootstrapService(db).bootstrapFromDiagnostic({
    userId: USER,
    diagnosticAttemptId: 'da1',
    assessedLevel: 'B1',
    answers: ANSWERS,
    concepts: CONCEPTS,
    occurredAtMs: at,
  });

const missX = (db: LearnerModelDb, at: bigint) =>
  createLearnerService(db).recordOutcome({
    userId: USER,
    itemId: 'item.x',
    correct: false,
    occurredAtMs: at,
  });

const BOOTSTRAP_AT = T0 + 2n * SECOND;

/** ITEM_ATTEMPTED(X) ×2 → LEARNER_BOOTSTRAPPED(X, Y, Z). */
async function practiceThenBootstrap() {
  const store = createMemoryDb({ items: ITEMS, edges: EDGES });
  await missX(store.db, T0);
  await missX(store.db, T0 + SECOND);
  const boot = await bootstrapAt(store.db, BOOTSTRAP_AT);
  return { ...store, boot };
}

/** …→ ITEM_ATTEMPTED(X) once more after the diagnostic. */
async function practiceBootstrapPractice() {
  const store = await practiceThenBootstrap();
  await missX(store.db, T0 + 3n * SECOND);
  return store;
}

/** The same practice of X, with no diagnostic at all. */
async function practiceOnly(times: readonly bigint[]) {
  const store = createMemoryDb({ items: ITEMS, edges: EDGES });
  for (const at of times) await missX(store.db, at);
  return store;
}

describe('bootstrap over practice', () => {
  it('skips the practised concept and seeds the rest from the prior', async () => {
    const { masteries, boot } = await practiceThenBootstrap();
    const reference = await practiceOnly([T0, T0 + SECOND]);

    expect(boot.ok && boot.bootstrappedConceptIds).toEqual([Y, Z]);
    expect(boot.ok && boot.skipped).toEqual([{ conceptId: X, reason: 'already_observed' }]);

    // X carries exactly the state practice alone gives it.
    expect(masteries.get(`${USER}:${X}`)).toEqual(reference.masteries.get(`${USER}:${X}`));
    expect(masteries.get(`${USER}:${X}`)?.observationCount).toBe(2);

    // Y starts from the diagnostic prior, as unobserved.
    const y = masteries.get(`${USER}:${Y}`);
    expect(y?.pKnown).toBeCloseTo(0.6, 12);
    expect(y?.observationCount).toBe(0);
    expect(y?.displayStage).toBe('NOT_STARTED');
    expect(y?.lastUpdatedAt).toBe(BOOTSTRAP_AT);
  });

  it('replay of the mixed history reproduces the live projections', async () => {
    const { db, masteries, reviews } = await practiceBootstrapPractice();
    const liveMasteries = structuredClone([...masteries]);
    const liveReviews = structuredClone([...reviews]);

    const result = await replayUser(db, USER);

    expect(result.eventsProcessed).toBe(4);
    expect([...masteries]).toEqual(liveMasteries);
    expect([...reviews]).toEqual(liveReviews);
    // …and what both agree on is the right answer: X keeps its practice,
    // Y holds the diagnostic prior.
    const reference = await practiceOnly([T0, T0 + SECOND, T0 + 3n * SECOND]);
    expect(masteries.get(`${USER}:${X}`)).toEqual(reference.masteries.get(`${USER}:${X}`));
    expect(masteries.get(`${USER}:${Y}`)?.pKnown).toBeCloseTo(0.6, 12);
    expect(masteries.get(`${USER}:${Y}`)?.observationCount).toBe(0);
  });

  it('selection: X stays a started concept, Y stays gated behind X', async () => {
    const { db, masteries } = await practiceThenBootstrap();
    const x = masteries.get(`${USER}:${X}`);
    const reference = (await practiceOnly([T0, T0 + SECOND])).masteries.get(`${USER}:${X}`);
    // X keeps pKnown, observationCount and displayStage from practice — and
    // was missed every time, so it is far below the 0.7 gate for Y.
    expect(x).toEqual(reference);
    expect(x?.pKnown).toBeLessThan(0.7);

    // Right after the diagnostic X's learning step is not due yet, so the
    // pick is Thompson's among unlocked concepts, not REVIEW_DUE.
    const nowMs = Number(BOOTSTRAP_AT) + 500;
    const svc = createSelectionService(db);
    const picked = new Map<string, boolean>(); // conceptId → isNewConcept
    for (let seed = 0; seed < 64; seed++) {
      const out = await svc.selectNext({ userId: USER, nowMs, seed });
      if (out.ok) picked.set(out.result.conceptId, out.result.isNewConcept);
    }

    // Y has a bootstrap row, but no observations: the hard gate still applies.
    expect(picked.has(Y)).toBe(false);
    expect(picked.get(Z)).toBe(true);
    // X keeps its practice, so it is never presented as a new concept.
    expect(picked.get(X)).toBe(false);
  });

  it('pickStartConcept never suggests the practised concept', async () => {
    const { db } = await practiceThenBootstrap();
    const masteries = (await db.getMasterySnapshots(USER)).map((m) => ({
      ...m,
      lastUpdatedAt: Number(m.lastUpdatedAt),
    }));

    // X (A2, weakest pKnown) would win the ranking if it were not started.
    expect(
      pickStartConcept({
        assessedLevel: 'B1',
        levelTrajectory: [],
        answers: [],
        concepts: CONCEPTS.map(({ id, cefrLevel }) => ({ id, cefrLevel })),
        masteries,
        prereqEdges: EDGES,
      }),
    ).toBe(Z);
  });

  it('still records the diagnostic when every concept was already practised', async () => {
    const { db, events, masteries } = createMemoryDb({ items: ITEMS, edges: EDGES });
    await missX(db, T0);
    const before = structuredClone([...masteries]);

    const boot = await createBootstrapService(db).bootstrapFromDiagnostic({
      userId: USER,
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS.filter((c) => c.id === X),
      occurredAtMs: T0 + SECOND,
    });

    expect(boot).toEqual({
      ok: true,
      occurredAt: T0 + SECOND,
      bootstrappedConceptIds: [],
      skipped: [{ conceptId: X, reason: 'already_observed' }],
    });
    expect(events.map((e) => e.type)).toEqual(['ITEM_ATTEMPTED', 'LEARNER_BOOTSTRAPPED']);
    expect([...masteries]).toEqual(before);
  });
});
