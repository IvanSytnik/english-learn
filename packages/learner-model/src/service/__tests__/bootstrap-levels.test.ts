import { describe, expect, it } from 'vitest';
import { SEED_CONCEPTS, SEED_EDGES } from '../../../seed';
import { ALL_ITEMS } from '../../../seed/items';
import type { CefrLevel } from '../../core/graph/types';
import { type BootstrapConcept, type DiagnosticAnswerFact, MAPPING_V1 } from '../../diagnostic';
import { DEFAULT_POLICY_CONFIG, isMastered } from '../../policy';
import { createBootstrapService } from '../bootstrap-service';
import type { ItemForOutcome, LearnerModelDb, PrereqEdgeRow } from '../db-port';
import { createLearnerService } from '../learner-service';
import { createSelectionService } from '../selection-service';
import { createMemoryDb } from './memory-db';

/**
 * Integration: what a diagnostic level opens across prerequisite edges that
 * cross CEFR levels (§9 п. 7, before the B2 content). The bootstrap ceiling
 * (0.6) sits below the prerequisite gate (0.7), so no diagnostic result opens
 * a concept that has a parent: a B2 concept is reachable at once only as a
 * root, and every edge in front of it costs right answers on the parent.
 *
 * The answer counts below follow from BKT_DEFAULTS, the 4PL observation
 * model (THETA_KNOWN = 3, every item b = 0) and formula v1; a deliberate
 * change to any of them regenerates them. Since §8 #19 the gate's
 * prereqMinObservations (3), not pKnown, sets the price of an edge.
 */

const A2_ROOT = 'grammar.a2_root';
const B1_MID = 'grammar.b1_mid';
const B2_CHILD = 'grammar.b2_child';
const B2_ROOT = 'grammar.b2_root';

const ITEM_OF: Record<string, string> = {
  [A2_ROOT]: 'item.a2_root.a',
  [B1_MID]: 'item.b1_mid.a',
  [B2_CHILD]: 'item.b2_child.a',
  [B2_ROOT]: 'item.b2_root.a',
};

const ITEMS: Record<string, ItemForOutcome> = Object.fromEntries(
  Object.entries(ITEM_OF).map(([conceptId, itemId]) => [
    itemId,
    { conceptId, irtDiscrimination: 1, irtDifficulty: 0 },
  ]),
);

// A2 root → B1 → B2 child, and a B2 concept with no parent.
const EDGES: PrereqEdgeRow[] = [
  { from: A2_ROOT, to: B1_MID, kind: 'PREREQUISITE' },
  { from: B1_MID, to: B2_CHILD, kind: 'PREREQUISITE' },
];

const CONCEPTS: BootstrapConcept[] = [
  { id: A2_ROOT, category: 'GRAMMAR', cefrLevel: 'A2' },
  { id: B1_MID, category: 'GRAMMAR', cefrLevel: 'B1' },
  { id: B2_CHILD, category: 'GRAMMAR', cefrLevel: 'B2' },
  { id: B2_ROOT, category: 'GRAMMAR', cefrLevel: 'B2' },
];

const LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
type DiagnosticLevel = (typeof LEVELS)[number];

/** All right on both axes at `level`: the ladder settles both axes there. */
const perfectAt = (level: DiagnosticLevel): DiagnosticAnswerFact[] =>
  Array.from({ length: 16 }, (_, position) => ({
    axis: position % 2 === 0 ? ('GRAMMAR' as const) : ('VOCAB' as const),
    correct: true,
    itemLevel: level,
    position,
  }));

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

async function bootstrapped(
  level: DiagnosticLevel,
  graph: {
    items: Record<string, ItemForOutcome>;
    edges: PrereqEdgeRow[];
    concepts: BootstrapConcept[];
  } = { items: ITEMS, edges: EDGES, concepts: CONCEPTS },
) {
  const memory = createMemoryDb({
    items: graph.items,
    edges: graph.edges,
    assessedLevels: { u1: level },
    concepts: graph.concepts.map(({ id, cefrLevel }) => ({ id, cefrLevel })),
  });
  const boot = await createBootstrapService(memory.db).bootstrapFromDiagnostic({
    userId: 'u1',
    diagnosticAttemptId: 'da1',
    assessedLevel: level,
    answers: perfectAt(level),
    concepts: graph.concepts,
    occurredAtMs: BigInt(T0),
  });
  expect(boot.ok).toBe(true);
  return memory;
}

/** Concepts selectNext picks across many seeds at `nowMs`. */
async function conceptsPicked(
  db: LearnerModelDb,
  nowMs: number,
  config = DEFAULT_POLICY_CONFIG,
): Promise<Set<string>> {
  const svc = createSelectionService(db);
  const picked = new Set<string>();
  for (let seed = 0; seed < 64; seed++) {
    const out = await svc.selectNext({ userId: 'u1', nowMs, seed, config });
    if (out.ok) picked.add(out.result.conceptId);
  }
  return picked;
}

describe('diagnostic level × prerequisite edges', () => {
  it('the bootstrap ceiling sits below the prerequisite gate', () => {
    expect(MAPPING_V1.ceiling).toBeLessThan(DEFAULT_POLICY_CONFIG.prereqThreshold);
  });

  for (const level of LEVELS) {
    it(`${level}: no prior reaches the gate, so only roots are open — a B2 root included`, async () => {
      const { db, masteries } = await bootstrapped(level);
      for (const { id } of CONCEPTS) {
        const row = masteries.get(`u1:${id}`);
        expect(row?.observationCount, id).toBe(0);
        expect(row?.pKnown, id).toBeLessThan(DEFAULT_POLICY_CONFIG.prereqThreshold);
      }
      // Once a concept is started the start-concept step stands aside and
      // Thompson draws over everything open. The gate is what this checks, so
      // the draw is today's level-blind one: under V6b an A2 learner almost
      // never draws a B2 concept, which hides nothing about the gate.
      const res = await createLearnerService(db).recordOutcome({
        userId: 'u1',
        itemId: ITEM_OF[B2_ROOT] as string,
        dontKnow: true,
        occurredAtMs: BigInt(T0 + MINUTE),
      });
      expect(res.ok).toBe(true);
      const levelBlind = { ...DEFAULT_POLICY_CONFIG, levelAware: false };
      expect(await conceptsPicked(db, T0 + MINUTE + 1000, levelBlind)).toEqual(
        new Set([A2_ROOT, B2_ROOT]),
      );
      // Level-aware (§8 #19): still only open concepts, never a gated one.
      const leveled = await conceptsPicked(db, T0 + MINUTE + 1000);
      for (const id of leveled) expect([A2_ROOT, B2_ROOT], id).toContain(id);
    });
  }

  it('a B2 learner starts on the B2 root; without one, two levels down on the A2 root', async () => {
    const withRoot = await bootstrapped('B2');
    expect(await conceptsPicked(withRoot.db, T0 + 1000)).toEqual(new Set([B2_ROOT]));

    const noRoot = CONCEPTS.filter((c) => c.id !== B2_ROOT);
    const withoutRoot = await bootstrapped('B2', {
      items: ITEMS,
      edges: EDGES,
      concepts: noRoot,
    });
    // B1_MID and B2_CHILD are nearer to B2 but locked behind their parents.
    expect(await conceptsPicked(withoutRoot.db, T0 + 1000)).toEqual(new Set([A2_ROOT]));
  });

  // Right answers on each parent, in chain order: until its pKnown reaches the
  // threshold (the level still shows here), and until it opens the gate —
  // prereqMinObservations (3) floors every parent at three answers (§8 #19).
  const costs: [DiagnosticLevel, number[], number[]][] = [
    ['A2', [2, 2], [3, 3]],
    ['B1', [1, 1], [3, 3]],
    ['B2', [1, 1], [3, 3]],
    ['C1', [1, 1], [3, 3]],
  ];
  for (const [level, toThreshold, expected] of costs) {
    it(`${level}: pKnown passes 0.7 after ${toThreshold.join(' + ')} right answers, the B2 child opens after ${expected.join(' + ')}`, async () => {
      const { db, masteries } = await bootstrapped(level);
      const learner = createLearnerService(db);
      let now = T0;
      const spent: number[] = [];
      const reached: number[] = [];
      for (const parent of [A2_ROOT, B1_MID]) {
        let n = 0;
        let atThreshold: number | null = null;
        while (!isMastered(masteries.get(`u1:${parent}`), DEFAULT_POLICY_CONFIG)) {
          // The child stays shut until the last parent passes the gate.
          expect(await conceptsPicked(db, now + 1000)).not.toContain(B2_CHILD);
          now += MINUTE;
          const res = await learner.recordOutcome({
            userId: 'u1',
            itemId: ITEM_OF[parent] as string,
            correct: true,
            occurredAtMs: BigInt(now),
          });
          expect(res.ok).toBe(true);
          n += 1;
          const pKnown = masteries.get(`u1:${parent}`)?.pKnown ?? 0;
          if (atThreshold === null && pKnown >= DEFAULT_POLICY_CONFIG.prereqThreshold) {
            atThreshold = n;
          }
          if (n > 20) throw new Error(`${parent} never reached the gate`);
        }
        spent.push(n);
        reached.push(atThreshold ?? 0);
      }
      expect(reached).toEqual(toThreshold);
      expect(spent).toEqual(expected);

      const svc = createSelectionService(db);
      let served = false;
      for (let seed = 0; seed < 64; seed++) {
        const out = await svc.selectNext({ userId: 'u1', nowMs: now + 1000, seed });
        if (out.ok && out.result.conceptId === B2_CHILD) {
          served = true;
          expect(out.result.reason).toBe('NEW_INTRODUCTION');
        }
      }
      expect(served).toBe(true);
    });
  }

  it('on the seed graph a C1 learner can start only concepts with no prerequisite', async () => {
    const items: Record<string, ItemForOutcome> = Object.fromEntries(
      ALL_ITEMS.map((i) => [
        i.id,
        {
          conceptId: i.conceptId,
          irtDiscrimination: i.irtDiscrimination ?? 1,
          irtDifficulty: i.irtDifficulty ?? 0,
        },
      ]),
    );
    const edges: PrereqEdgeRow[] = SEED_EDGES.map(({ from, to, kind }) => ({ from, to, kind }));
    const concepts: BootstrapConcept[] = SEED_CONCEPTS.map((c) => ({
      id: c.id,
      category: c.category,
      cefrLevel: c.cefrLevel as CefrLevel,
    }));
    const { db } = await bootstrapped('C1', { items, edges, concepts });
    const dependents = new Set(edges.filter((e) => e.kind === 'PREREQUISITE').map((e) => e.to));

    // Start one root so that Thompson, not the start concept, draws.
    const root = ALL_ITEMS.find((i) => !dependents.has(i.conceptId));
    if (!root) throw new Error('the seed graph has no root with items');
    const res = await createLearnerService(db).recordOutcome({
      userId: 'u1',
      itemId: root.id,
      dontKnow: true,
      occurredAtMs: BigInt(T0 + MINUTE),
    });
    expect(res.ok).toBe(true);

    const picked = await conceptsPicked(db, T0 + MINUTE + 1000);
    expect(picked.size).toBeGreaterThan(1);
    for (const id of picked) expect(dependents.has(id), id).toBe(false);
  });
});
