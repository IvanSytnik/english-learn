import { describe, expect, it } from 'vitest';
import type { ConceptMasteryWrite } from '../../adapters/concept-mastery';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../../diagnostic';
import { applyLearnerBootstrapped } from '../apply';
import type {
  LearnerEventInsert,
  LearnerEventRow,
  LearnerModelDb,
  LearnerModelTx,
} from '../db-port';
import { parseEventRow } from '../event-store';
import { createBootstrapService } from '../bootstrap-service';

/**
 * In-memory fake of LearnerModelDb — same approach as the selection-service
 * test. No Prisma. Only the methods bootstrap-service touches are meaningful;
 * the rest throw so accidental use is caught.
 */
function makeFakeDb() {
  const events: LearnerEventRow[] = [];
  const mastery = new Map<string, ConceptMasteryWrite>(); // key: `${userId}:${conceptId}`

  const tx: LearnerModelTx = {
    async appendEvent(e: LearnerEventInsert) {
      events.push({
        id: `evt_${events.length}`,
        userId: e.userId,
        type: e.type,
        occurredAt: e.occurredAt,
        payload: e.payload,
      });
    },
    async countEvents(userId: string) {
      return events.filter((e) => e.userId === userId).length;
    },
    async getConceptMastery(userId, conceptId) {
      const w = mastery.get(`${userId}:${conceptId}`);
      if (!w) return null;
      return { ...w };
    },
    async upsertConceptMastery(userId, conceptId, write) {
      mastery.set(`${userId}:${conceptId}`, write);
    },
    async getItemReviewState() {
      throw new Error('not used in bootstrap');
    },
    async upsertItemReviewState() {
      throw new Error('not used in bootstrap');
    },
    async deleteSnapshots(userId) {
      for (const k of [...mastery.keys()]) {
        if (k.startsWith(`${userId}:`)) mastery.delete(k);
      }
    },
    async listEventsAsc(userId, cursor, limit) {
      const rows = events
        .filter((e) => e.userId === userId)
        .sort((a, b) =>
          a.occurredAt === b.occurredAt
            ? a.id.localeCompare(b.id)
            : a.occurredAt < b.occurredAt
              ? -1
              : 1,
        );
      const start = cursor
        ? rows.findIndex(
            (r) => r.occurredAt === cursor.occurredAt && r.id === cursor.id,
          ) + 1
        : 0;
      return rows.slice(start, start + limit);
    },
  };

  const db: LearnerModelDb = {
    async getItemForOutcome() {
      throw new Error('not used in bootstrap');
    },
    async runInTx(fn) {
      return fn(tx);
    },
    async getMasterySnapshots() {
      throw new Error('not used');
    },
    async getPrereqEdges() {
      throw new Error('not used');
    },
    async getConceptEventCounts() {
      throw new Error('not used');
    },
    async getCandidateItems() {
      throw new Error('not used');
    },
  };

  return { db, events, mastery };
}

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
];

describe('createBootstrapService', () => {
  const at = 1_700_000_000_000n;

  it('writes one event and N ConceptMastery rows in a single tx', async () => {
    const { db, events, mastery } = makeFakeDb();
    const svc = createBootstrapService(db);

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
    expect(mastery.size).toBe(3);

    // grammar (strong) should start higher than vocab (weak)
    const pp = mastery.get('u1:grammar.present_perfect')!;
    const vt = mastery.get('u1:vocab.travel')!;
    expect(pp.pKnown).toBeGreaterThan(vt.pKnown);

    // above-level concept (B2 grammar) discounted vs at-level (B1 grammar)
    const cond = mastery.get('u1:grammar.conditionals')!;
    expect(cond.pKnown).toBeLessThan(pp.pKnown);

    // ceiling respected
    expect(pp.pKnown).toBeLessThanOrEqual(0.6);

    // lastUpdatedAt anchored to occurredAt; observationCount 0
    expect(pp.lastUpdatedAt).toBe(at);
    expect(pp.observationCount).toBe(0);
  });

  it('is strictly-once: a second bootstrap is rejected and writes nothing', async () => {
    const { db, events, mastery } = makeFakeDb();
    const svc = createBootstrapService(db);

    const first = await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: ANSWERS,
      concepts: CONCEPTS,
      occurredAtMs: at,
    });
    expect(first.ok).toBe(true);

    const snapshotBefore = new Map(mastery);

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
    expect([...mastery.entries()]).toEqual([...snapshotBefore.entries()]);
  });

  it('returns NO_CONCEPTS_BOOTSTRAPPED when every axis is too sparse', async () => {
    const { db, events } = makeFakeDb();
    const svc = createBootstrapService(db);

    const res = await svc.bootstrapFromDiagnostic({
      userId: 'u1',
      diagnosticAttemptId: 'da1',
      assessedLevel: 'B1',
      answers: [
        { axis: 'GRAMMAR', correct: true }, // only 1 answer, below threshold
        { axis: 'VOCAB', correct: true }, // only 1 answer
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
    const { db, events, mastery } = makeFakeDb();
    const svc = createBootstrapService(db);

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

    const rebuilt = applyLearnerBootstrapped(parsed.payload, parsed.occurredAt);

    for (const state of rebuilt) {
      const live = mastery.get(`u1:${state.conceptId}`)!;
      expect(state.bkt.pKnown).toBeCloseTo(live.pKnown, 12);
      expect(state.bkt.pLearn).toBeCloseTo(live.pLearn, 12);
      expect(state.bkt.pSlip).toBeCloseTo(live.pSlip, 12);
      expect(state.bkt.pGuess).toBeCloseTo(live.pGuess, 12);
      expect(state.bkt.pForgetLambda).toBeCloseTo(live.pForgetLambda, 12);
      expect(BigInt(state.bkt.lastUpdatedAt)).toBe(live.lastUpdatedAt);
      expect(state.bkt.observationCount).toBe(live.observationCount);
    }
  });
});
