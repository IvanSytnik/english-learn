import { describe, expect, it } from 'vitest';
import {
  accuracyBasedEstimator,
  type BootstrapConcept,
  type DiagnosticAnswerFact,
} from '../../diagnostic';
import { applyLearnerBootstrapped } from '../apply';
import { createBootstrapService } from '../bootstrap-service';
import { parseEventRow } from '../event-store';
import { replayUser } from '../replay';
import { createMemoryDb } from './memory-db';

const CONCEPTS: BootstrapConcept[] = [
  { id: 'grammar.present_perfect', category: 'GRAMMAR', cefrLevel: 'B1' },
  { id: 'grammar.conditionals', category: 'GRAMMAR', cefrLevel: 'B2' },
  { id: 'vocab.travel', category: 'VOCAB', cefrLevel: 'A2' },
];

const ANSWERS: DiagnosticAnswerFact[] = [
  { axis: 'GRAMMAR', correct: true },
  { axis: 'GRAMMAR', correct: true },
  { axis: 'GRAMMAR', correct: true },
  { axis: 'GRAMMAR', correct: false }, // grammar 3/4
  { axis: 'VOCAB', correct: false },
  { axis: 'VOCAB', correct: false },
  { axis: 'VOCAB', correct: true }, // vocab 1/3
].map((a, position) => ({
  ...(a as Pick<DiagnosticAnswerFact, 'axis' | 'correct'>),
  itemLevel: 'B1',
  position,
}));

/** These cases are about the write path, written against fraction-correct scores. */
const ACCURACY = { estimator: accuracyBasedEstimator };

describe('createBootstrapService', () => {
  const at = 1_700_000_000_000n;

  it('writes one event and N ConceptMastery rows in a single tx', async () => {
    const { db, events, masteries } = createMemoryDb();
    const svc = createBootstrapService(db, ACCURACY);

    const res = await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: at,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // one bootstrap event
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('LEARNER_BOOTSTRAPPED');

    // all three concepts bootstrapped (both axes have ≥3 answers)
    expect(res.bootstrappedConceptIds.sort()).toEqual([
      'grammar.conditionals',
      'grammar.present_perfect',
      'vocab.travel',
    ]);
    expect(masteries.size).toBe(3);

    // grammar (strong) should start higher than vocab (weak)
    const pp = masteries.get('u1:grammar.present_perfect')!;
    const vt = masteries.get('u1:vocab.travel')!;
    expect(pp.pKnown).toBeGreaterThan(vt.pKnown);

    // above-level concept (B2 grammar) discounted vs at-level (B1 grammar)
    const cond = masteries.get('u1:grammar.conditionals')!;
    expect(cond.pKnown).toBeLessThan(pp.pKnown);

    // ceiling respected
    expect(pp.pKnown).toBeLessThanOrEqual(0.6);

    // lastUpdatedAt anchored to occurredAt; observationCount 0
    expect(pp.lastUpdatedAt).toBe(at);
    expect(pp.observationCount).toBe(0);
  });

  it('is strictly-once: a second bootstrap is rejected and writes nothing', async () => {
    const { db, events, masteries } = createMemoryDb();
    const svc = createBootstrapService(db, ACCURACY);

    const first = await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: at,
    });
    expect(first.ok).toBe(true);

    const snapshotBefore = new Map(masteries);

    const second = await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da2',
      assessedLevel: 'C1', // different result — must NOT overwrite
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: at + 1000n,
    });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toBe('ALREADY_BOOTSTRAPPED');

    // still exactly one event, mastery unchanged
    expect(events).toHaveLength(1);
    expect([...masteries.entries()]).toEqual([...snapshotBefore.entries()]);
  });

  it('returns NO_CONCEPTS_BOOTSTRAPPED when every axis is too sparse', async () => {
    const { db, events } = createMemoryDb();
    const svc = createBootstrapService(db, ACCURACY);

    const res = await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: [
        { axis: 'GRAMMAR', correct: true, itemLevel: 'B1', position: 0 }, // only 1 answer, below threshold
        { axis: 'VOCAB', correct: true, itemLevel: 'B1', position: 1 }, // only 1 answer
      ],
      concepts: CONCEPTS,
      occurredAtMs: at,
    });

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe('NO_CONCEPTS_BOOTSTRAPPED');
    expect(events).toHaveLength(0); // no empty event emitted
  });

  it('replay from the stored event reproduces the same ConceptMastery', async () => {
    const { db, events, masteries } = createMemoryDb();
    const svc = createBootstrapService(db, ACCURACY);

    await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: at,
    });

    // Rebuild from the frozen event, independent of the live write path.
    const parsed = parseEventRow(events[0]!);
    expect(parsed.type).toBe('LEARNER_BOOTSTRAPPED');
    if (parsed.type !== 'LEARNER_BOOTSTRAPPED') return;

    const rebuilt = applyLearnerBootstrapped(parsed.payload, parsed.occurredAt, () => null);
    expect(rebuilt.skipped).toEqual([]);

    for (const state of rebuilt.states) {
      const live = masteries.get(`u1:${state.conceptId}`)!;
      expect(state.bkt.pKnown).toBeCloseTo(live.pKnown, 12);
      expect(state.bkt.pLearn).toBeCloseTo(live.pLearn, 12);
      expect(state.bkt.pSlip).toBeCloseTo(live.pSlip, 12);
      expect(state.bkt.pGuess).toBeCloseTo(live.pGuess, 12);
      expect(state.bkt.pForgetLambda).toBeCloseTo(live.pForgetLambda, 12);
      expect(BigInt(state.bkt.lastUpdatedAt)).toBe(live.lastUpdatedAt);
      expect(state.bkt.observationCount).toBe(live.observationCount);
    }
  });

  it("don't-know answers flow through bootstrap exactly like incorrect ones", async () => {
    // Same answer sheet, but every wrong answer was given as "I don't know".
    const dontKnowAnswers: DiagnosticAnswerFact[] = ANSWERS.map((a) =>
      a.correct ? a : { ...a, dontKnow: true },
    );

    const plain = createMemoryDb();
    const flagged = createMemoryDb();
    const input = {
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1' as const,
      concepts: CONCEPTS,
      occurredAtMs: at,
    };
    const a = await createBootstrapService(plain.db, ACCURACY).bootstrapFromDiagnostic({
      ...input,
      answers: ANSWERS,
    });
    const b = await createBootstrapService(flagged.db, ACCURACY).bootstrapFromDiagnostic({
      ...input,
      answers: dontKnowAnswers,
    });

    expect(b).toEqual(a);
    expect(flagged.events[0]?.payload).toEqual(plain.events[0]?.payload);
    expect([...flagged.masteries.entries()]).toEqual([...plain.masteries.entries()]);
  });
});

describe('bootstrap with the ladder estimator (the default)', () => {
  const at = 1_700_000_000_000n;
  // GRAMMAR's last four questions were C1, VOCAB's were A2.
  const answers: DiagnosticAnswerFact[] = [0, 1, 2, 3, 4, 5, 6, 7].map((position) => ({
    axis: position % 2 === 0 ? 'GRAMMAR' : 'VOCAB',
    correct: position % 2 === 0,
    itemLevel: position % 2 === 0 ? 'C1' : 'A2',
    position,
  }));

  it('freezes the estimator and per-axis levels, anchoring each axis on its own level', async () => {
    const { db, events, masteries } = createMemoryDb();
    const res = await createBootstrapService(db).bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers,
      concepts: CONCEPTS,
      occurredAtMs: at,
    });
    expect(res.ok).toBe(true);

    const payload = events[0]?.payload as { estimator: string; axes: unknown[] };
    expect(payload.estimator).toBe('ladder');
    expect(payload.axes).toEqual([
      { axis: 'VOCAB', score: 0.25, answered: 4, level: 'A2' },
      { axis: 'GRAMMAR', score: 1, answered: 4, level: 'C1' },
      { axis: 'LISTENING', score: 0, answered: 0 },
    ]);

    // GRAMMAR at C1: B1 and B2 concepts both at/below → ceiling (the global
    // B1 would have discounted the B2 one). VOCAB at A2: 0.15 + 0.25 · 0.45.
    expect(masteries.get('u1:grammar.present_perfect')?.pKnown).toBeCloseTo(0.6, 12);
    expect(masteries.get('u1:grammar.conditionals')?.pKnown).toBeCloseTo(0.6, 12);
    expect(masteries.get('u1:vocab.travel')?.pKnown).toBeCloseTo(0.2625, 12);
  });

  it('replay from the stored ladder payload reproduces the live rows', async () => {
    const { db, masteries } = createMemoryDb();
    await createBootstrapService(db).bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers,
      concepts: CONCEPTS,
      occurredAtMs: at,
    });
    const live = structuredClone([...masteries]);

    await replayUser(db, 'u1');
    expect([...masteries]).toEqual(live);
  });
});
