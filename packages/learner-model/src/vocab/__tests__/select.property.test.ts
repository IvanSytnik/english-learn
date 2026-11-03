import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CEFRLevel } from '../../core/graph/types';
import {
  CONCEPT_SPREAD_RECENT,
  CONCEPT_SPREAD_WINDOW,
  selectVocab,
  type VocabCandidate,
  type VocabSelectInput,
} from '../select';

/**
 * Selector v2 (B6.2) properties over random pools: scope never hides a due
 * review, hidden words are never NEW, priority beats level distance,
 * frequency orders a level, concept spread, determinism.
 */

const NOW = 1_800_000_000_000;
const LEVELS: CEFRLevel[] = ['A1', 'A2', 'B1'];
const CONCEPTS = ['c0', 'c1', 'c2', 'c3', 'c4'];
const COLLECTIONS = ['k0', 'k1'];

const candidateArb = (i: number) =>
  fc
    .record({
      conceptId: fc.constantFrom(...CONCEPTS),
      cefrLevel: fc.constantFrom(...LEVELS),
      frequencyRank: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
      collections: fc.subarray(COLLECTIONS),
      state: fc.constantFrom('new', 'due', 'later', 'learning'),
      offset: fc.integer({ min: 1, max: 10_000 }),
    })
    .map(({ state, offset, ...c }): VocabCandidate => {
      const itemId = `w${i}`;
      if (state === 'new') return { itemId, ...c, review: null };
      const dueAt = BigInt(NOW + (state === 'later' ? offset * 60_000 : -offset * 60_000));
      return {
        itemId,
        ...c,
        review: {
          dueAt,
          cardStatus: state === 'learning' ? 'LEARNING' : 'REVIEW',
          stability: 5,
          lastReviewAt: dueAt - 600_000n,
        },
      };
    });

const poolArb = fc
  .integer({ min: 1, max: 40 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => candidateArb(i))));

const scopeArb = fc.option(
  fc.oneof(
    fc.constantFrom(...CONCEPTS).map((conceptId) => ({ kind: 'concept' as const, conceptId })),
    fc.constantFrom(...COLLECTIONS).map((key) => ({ kind: 'collection' as const, key })),
  ),
  { nil: undefined },
);

const input = (
  candidates: VocabCandidate[],
  over: Partial<VocabSelectInput> = {},
): VocabSelectInput => ({
  candidates,
  nowMs: NOW,
  newToday: 0,
  dailyLimit: 10,
  targetLevel: null,
  seed: 'u:day',
  priorityItemIds: new Set(),
  hiddenItemIds: new Set(),
  recentConceptIds: [],
  ...over,
});

const isDueReview = (c: VocabCandidate) =>
  c.review !== null && c.review.cardStatus === 'REVIEW' && c.review.dueAt <= BigInt(NOW);
const isNew = (c: VocabCandidate) => c.review === null;

describe('selectVocab v2 properties', () => {
  it('a due review is served first whatever the scope', () => {
    fc.assert(
      fc.property(poolArb, scopeArb, (pool, scope) => {
        const out = selectVocab(input(pool, { scope }));
        if (pool.some(isDueReview)) expect(out).toMatchObject({ ok: true, reason: 'REVIEW_DUE' });
      }),
    );
  });

  it('a hidden word is never served as NEW', () => {
    fc.assert(
      fc.property(poolArb, fc.array(fc.nat(40)), scopeArb, (pool, hidden, scope) => {
        const hiddenItemIds = new Set(hidden.map((i) => `w${i}`));
        const out = selectVocab(input(pool, { hiddenItemIds, scope }));
        if (out.ok && out.reason === 'NEW') expect(hiddenItemIds.has(out.itemId)).toBe(false);
      }),
    );
  });

  it('a NEW word comes from the scope', () => {
    fc.assert(
      fc.property(poolArb, scopeArb, (pool, scope) => {
        const out = selectVocab(input(pool, { scope }));
        if (!(out.ok && out.reason === 'NEW') || scope === undefined) return;
        const c = pool.find((p) => p.itemId === out.itemId) as VocabCandidate;
        if (scope.kind === 'concept') expect(c.conceptId).toBe(scope.conceptId);
        else expect(c.collections).toContain(scope.key);
      }),
    );
  });

  it('a prioritized new word beats any level distance', () => {
    fc.assert(
      fc.property(
        poolArb,
        fc.nat(40),
        fc.constantFrom<CEFRLevel | null>(null, 'A1', 'B1'),
        (pool, p, targetLevel) => {
          const fresh = pool.filter(isNew);
          const priority = fresh[p % Math.max(1, fresh.length)];
          if (!priority || pool.some((c) => c.review !== null && c.review.dueAt <= BigInt(NOW)))
            return;
          const out = selectVocab(
            input(pool, { targetLevel, priorityItemIds: new Set([priority.itemId]) }),
          );
          expect(out).toMatchObject({ ok: true, reason: 'NEW', itemId: priority.itemId });
        },
      ),
    );
  });

  it('within one level distance, frequency decides before the day seed (no concept pressure)', () => {
    fc.assert(
      fc.property(poolArb, (pool) => {
        if (pool.some((c) => c.review !== null && c.review.dueAt <= BigInt(NOW))) return;
        const out = selectVocab(input(pool));
        if (!(out.ok && out.reason === 'NEW')) return;
        const chosen = pool.find((c) => c.itemId === out.itemId) as VocabCandidate;
        const rank = (c: VocabCandidate) => c.frequencyRank ?? Number.POSITIVE_INFINITY;
        for (const c of pool.filter(isNew).filter((c) => c.cefrLevel === chosen.cefrLevel)) {
          expect(rank(chosen)).toBeLessThanOrEqual(rank(c));
        }
      }),
    );
  });

  it('avoids the last served concepts when the top 20 holds an alternative', () => {
    fc.assert(
      fc.property(
        poolArb,
        fc.subarray(CONCEPTS, { minLength: 1, maxLength: 4 }),
        (pool, recentConceptIds) => {
          if (pool.some((c) => c.review !== null && c.review.dueAt <= BigInt(NOW))) return;
          const out = selectVocab(input(pool, { recentConceptIds }));
          if (!(out.ok && out.reason === 'NEW')) return;
          const recent = new Set(recentConceptIds.slice(-CONCEPT_SPREAD_RECENT));
          const chosen = pool.find((c) => c.itemId === out.itemId) as VocabCandidate;
          // Rebuild the top window: the selection without spread over the same pool.
          const window: VocabCandidate[] = [];
          let left = pool.filter(isNew);
          while (window.length < CONCEPT_SPREAD_WINDOW && left.length > 0) {
            const o = selectVocab(input(left));
            if (!o.ok) break;
            const c = left.find((x) => x.itemId === o.itemId) as VocabCandidate;
            window.push(c);
            left = left.filter((x) => x.itemId !== c.itemId);
          }
          if (window.some((c) => !recent.has(c.conceptId)))
            expect(recent.has(chosen.conceptId)).toBe(false);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('a session never serves 3 new words in a row from one concept while another has one', () => {
    fc.assert(
      fc.property(poolArb, (start) => {
        let pool = start.map((c) => ({ ...c, review: null }));
        const served: string[] = [];
        while (pool.length > 0) {
          const out = selectVocab(input(pool, { recentConceptIds: served.slice(-3) }));
          if (!out.ok) break;
          const c = pool.find((x) => x.itemId === out.itemId) as VocabCandidate;
          const run = served.slice(-2);
          if (run.length === 2 && run.every((id) => id === c.conceptId)) {
            expect(pool.every((x) => x.conceptId === c.conceptId)).toBe(true);
          }
          served.push(c.conceptId);
          pool = pool.filter((x) => x.itemId !== c.itemId);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('is deterministic: the same input picks the same word', () => {
    fc.assert(
      fc.property(poolArb, scopeArb, fc.string(), (pool, scope, seed) => {
        expect(selectVocab(input(pool, { scope, seed }))).toEqual(
          selectVocab(input(pool, { scope, seed })),
        );
      }),
    );
  });
});
