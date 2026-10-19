import { describe, expect, it } from 'vitest';
import type { ConceptMasteryRow } from '../../adapters/concept-mastery';
import type { ItemReviewStateRow } from '../../adapters/item-review-state';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../../diagnostic';
import { createBootstrapService } from '../bootstrap-service';
import type {
  ItemForOutcome,
  LearnerEventRow,
  LearnerModelDb,
  LearnerModelTx,
  PrereqEdgeRow,
} from '../db-port';
import { createLearnerService } from '../learner-service';
import { createSelectionService } from '../selection-service';

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

// Perfect grammar diagnostic → both concepts bootstrapped at the 0.6 ceiling.
const ANSWERS: DiagnosticAnswerFact[] = Array.from({ length: 5 }, () => ({
  axis: 'GRAMMAR' as const,
  correct: true,
}));

function createStore() {
  const events: LearnerEventRow[] = [];
  const masteries = new Map<string, ConceptMasteryRow>(); // `${userId}:${conceptId}`
  const reviews = new Map<string, ItemReviewStateRow>(); // `${userId}:${itemId}`

  const tx: LearnerModelTx = {
    async appendEvent(event) {
      events.push({
        id: `evt_${String(events.length).padStart(6, '0')}`,
        userId: event.userId,
        type: event.type,
        occurredAt: event.occurredAt,
        payload: event.payload,
      });
    },
    async countEvents(userId) {
      return events.filter((e) => e.userId === userId).length;
    },
    async getConceptMastery(userId, conceptId) {
      return masteries.get(`${userId}:${conceptId}`) ?? null;
    },
    async upsertConceptMastery(userId, conceptId, write) {
      masteries.set(`${userId}:${conceptId}`, { ...write });
    },
    async getItemReviewState(userId, itemId) {
      return reviews.get(`${userId}:${itemId}`) ?? null;
    },
    async upsertItemReviewState(userId, itemId, write) {
      reviews.set(`${userId}:${itemId}`, { ...write });
    },
    async deleteSnapshots() {
      throw new Error('not used');
    },
    async listEventsAsc() {
      throw new Error('not used');
    },
  };

  const db: LearnerModelDb = {
    async getItemForOutcome(itemId) {
      return ITEMS[itemId] ?? null;
    },
    async runInTx(fn) {
      return fn(tx);
    },
    async getMasterySnapshots(userId) {
      return [...masteries.entries()]
        .filter(([key]) => key.startsWith(`${userId}:`))
        .map(([key, row]) => ({
          conceptId: key.slice(userId.length + 1),
          pKnown: row.pKnown,
          observationCount: row.observationCount,
          lastUpdatedAt: row.lastUpdatedAt,
          pForgetLambda: row.pForgetLambda,
        }));
    },
    async getPrereqEdges() {
      return EDGES;
    },
    async getConceptEventCounts(userId) {
      const tally = new Map<string, { correct: number; incorrect: number }>();
      for (const e of events) {
        if (e.userId !== userId || e.type !== 'ITEM_ATTEMPTED') continue;
        const p = e.payload as { conceptId: string; correct: boolean };
        const t = tally.get(p.conceptId) ?? { correct: 0, incorrect: 0 };
        if (p.correct) t.correct += 1;
        else t.incorrect += 1;
        tally.set(p.conceptId, t);
      }
      return [...tally.entries()].map(([conceptId, t]) => ({ conceptId, ...t }));
    },
    async getCandidateItems(userId) {
      return Object.entries(ITEMS).map(([itemId, item]) => ({
        itemId,
        conceptId: item.conceptId,
        irtDiscrimination: item.irtDiscrimination,
        irtDifficulty: item.irtDifficulty,
        cefrLevel: 'A2' as const,
        dueAt: reviews.get(`${userId}:${itemId}`)?.dueAt ?? null,
        lastReviewAt: reviews.get(`${userId}:${itemId}`)?.lastReviewAt ?? null,
      }));
    },
  };

  return { db, masteries };
}

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
    const { db, masteries } = createStore();
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

    // Both concepts have a bootstrap snapshot, yet only the root is selectable:
    // the dependent's prerequisite sits at the 0.6 bootstrap ceiling (< 0.7).
    expect(await conceptsPicked(db, T0 + 1000)).toEqual(new Set([ROOT]));
  });

  it('practising the prerequisite past the threshold unlocks the dependent as a new concept', async () => {
    const { db, masteries } = createStore();
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
    let now = T0;
    for (let i = 0; i < 10 && (masteries.get(`u1:${ROOT}`)?.pKnown ?? 0) < 0.7; i++) {
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
