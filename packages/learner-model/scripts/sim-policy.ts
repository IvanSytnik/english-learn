/**
 * Selection-policy simulator (§8 #19, stage 2 / 2b). Read-only: no database,
 * no writes — synthetic learners answer the seed bank through the package's
 * real pure code (select, the gate, Beta sampling, the BKT/FSRS fold,
 * bootstrap, the start concept). Candidate policies are a copy of select()
 * with a pluggable concept score; the copy is checked pick-for-pick against
 * the real select() on today's policy before anything is reported.
 *
 * Usage (from packages/learner-model):
 *   pnpm sim:policy                  # V0 vs V6b vs the chosen guard, 1000 seeds
 *   pnpm sim:policy --seeds 200      # quicker
 *   pnpm sim:policy --grid           # the stage-2b micro-calibration grid
 *   pnpm sim:policy --only "G1s3"    # variants whose name contains the text
 *
 * Every run covers four scenarios: correct placement, the diagnostic one level
 * too high (both axes) / too low (both axes) / too high on grammar only. The
 * acceptance criteria (HANDOFF §7 «Решения 2026-10-27 (Thompson V6b)») are
 * evaluated at the end.
 *
 * The learner model is synthetic (truthP below) and shares the form of the
 * policy's prior — results are optimistic and compare policies, they do not
 * predict real learners.
 */

import type { CefrLevelValue } from '@englishlearn/db/schemas';
import { SEED_CONCEPTS, SEED_EDGES } from '../seed';
import { ALL_ITEMS } from '../seed/items';
import { initBktState } from '../src/core/bkt/model';
import type { BktState } from '../src/core/bkt/types';
import type { FsrsCardState } from '../src/core/fsrs/types';
import { CEFR_RANK } from '../src/core/graph/types';
import { buildBootstrapSnapshots, pickStartConcept } from '../src/diagnostic';
import type { MasteryStage } from '../src/mastery/stage';
import {
  computeUnlocked,
  DEFAULT_POLICY_CONFIG,
  type DueItem,
  isMastered,
  type LevelGuardOutcome,
  levelGuard,
  makeRng,
  meanDifficultyByConcept,
  type Rng,
  type SelectionInput,
  type SelectionOutcome,
  type SelectionReason,
  sampleBeta,
  seedFromString,
  select,
} from '../src/policy';
import { isStarted } from '../src/policy/curriculum';
import { applyItemAttempted } from '../src/service/apply';

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : (argv[i + 1] ?? '');
};
const SEEDS = Number(flag('--seeds') ?? 1000);
const GRID = argv.includes('--grid');
const ONLY = flag('--only');

// ── Horizon ─────────────────────────────────────────────────────────────────
const STEPS = 60; // 5 daily sessions × 12 questions
const PER_SESSION = 12;
const T0 = Date.UTC(2026, 10, 1, 9);
const MINUTE = 60_000;
const DAY = 86_400_000;

// ── Content (the seed graph and the practisable items) ──────────────────────
type Level = 'A2' | 'B1' | 'B2' | 'C1';
type Axis = 'GRAMMAR' | 'VOCAB';
const LEVELS: readonly Level[] = ['A2', 'B1', 'B2', 'C1'];
const RANK: Record<CefrLevelValue, number> = { A1: -1, A2: 0, B1: 1, B2: 2, C1: 3, C2: 4 };
const LADDER_SCORE: Record<Level, number> = { A2: 0.25, B1: 0.5, B2: 0.75, C1: 1.0 };
/** Highest level with content today (B2): a C1 learner aims there. */
const MAX_CONTENT_RANK = 2;

const concepts = SEED_CONCEPTS.map((c) => ({
  id: c.id,
  category: c.category,
  cefrLevel: c.cefrLevel,
}));
const rankOf = new Map(concepts.map((c) => [c.id, RANK[c.cefrLevel]]));
const axisOf = new Map(
  concepts.map((c) => [c.id, (c.category === 'GRAMMAR' ? 'GRAMMAR' : 'VOCAB') as Axis]),
);
const prereqEdges = SEED_EDGES.filter((e) => e.kind === 'PREREQUISITE').map((e) => ({
  from: e.from,
  to: e.to,
  kind: 'PREREQUISITE' as const,
}));
const items = ALL_ITEMS.filter((i) => (i.content as { practice?: unknown }).practice).map((i) => ({
  itemId: i.id,
  conceptId: i.conceptId,
  a: i.irtDiscrimination ?? 1,
  b: i.irtDifficulty ?? 0,
  cefrLevel: i.cefrLevel,
}));
const itemById = new Map(items.map((i) => [i.itemId, i]));
const rank = (conceptId: string) => rankOf.get(conceptId) ?? 0;
const levelById = new Map(concepts.map((c) => [c.id, c.cefrLevel]));
const conceptLevel = (conceptId: string) => levelById.get(conceptId) ?? 'A2';
const conceptLevels = Object.fromEntries(levelById);
const contentRanks = items.map((i) => CEFR_RANK[conceptLevel(i.conceptId)]);

/** What selection-service hands select() on the level-aware path. */
function realLevel(assessed: Level, outcomes: readonly LevelGuardOutcome[]) {
  const { theta } = levelGuard({
    placedRank: CEFR_RANK[assessed],
    outcomes,
    minRank: Math.min(...contentRanks),
    maxRank: Math.max(...contentRanks),
    config: DEFAULT_POLICY_CONFIG.levelPolicy.guard,
  });
  return { learnerLevel: { theta }, conceptLevels };
}

const sig = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Ground truth, unknown to the policy: P(correct) = 0.25 + 0.70·σ(1.7·(ℓ − r)
 * + 1 + gain), gain = min(0.3·practised, 2.5). At the learner's level 0.76 on
 * first sight, one level above 0.48, two above 0.31.
 */
function truthP(trueRank: number, conceptId: string, practised: number): number {
  return (
    0.25 + 0.7 * sig(1.7 * (trueRank - rank(conceptId)) + 1.0 + Math.min(0.3 * practised, 2.5))
  );
}

// ── V6b core ────────────────────────────────────────────────────────────────
/** Prior strength in pseudo-observations. */
const S = 6;
/** Logit per CEFR step. */
const K = 1.5;
/** Logit offset at the learner's own level. */
const C0 = 0.75;
/** Score penalty per CEFR step away from the target level. */
const LAMBDA = 0.2;
/** Predicted success of a concept at rank r for a learner at θ. */
const mu = (theta: number, r: number) =>
  Math.min(0.9, Math.max(0.1, 0.25 + 0.65 * sig(K * (theta - r) + C0)));

// ── Level guard ─────────────────────────────────────────────────────────────
type Guard = {
  /** G1: this many misses in a row at the target level → one level down. */
  streak?: number;
  /** G1 early: a shorter streak that only applies within the first `within` answers at a level. */
  earlyStreak?: { streak: number; within: number };
  /** G2: of the first `n` answers at a newly set target level, fewer than `min` right → down. */
  early?: { n: number; min: number };
  /** R: while below the placement, the last `n` answers at the lowered level ≥ `min` → one up. */
  recover?: { n: number; min: number };
  /** G3: one guard per axis instead of one per learner. */
  perAxis?: boolean;
};
type Variant = { name: string; core: 'V0' | 'V6b'; guard?: Guard };

class LevelGuard {
  /** Current target rank (may sit above the content, e.g. C1 = 3). */
  t: number;
  private streakNow = 0;
  private sinceSet: boolean[] = [];
  private recent: boolean[] = [];
  downs = 0;
  ups = 0;

  constructor(
    readonly placed: number,
    private readonly g: Guard | undefined,
  ) {
    this.t = placed;
  }

  /** The level the policy aims at: the target, capped at the content. */
  get target(): number {
    return Math.min(this.t, MAX_CONTENT_RANK);
  }

  private moveTo(t: number) {
    this.t = t;
    this.streakNow = 0;
    this.sinceSet = [];
    this.recent = [];
  }

  /** Feed one answer. Only answers at the target level count. */
  observe(conceptRank: number, correct: boolean) {
    const g = this.g;
    if (!g || conceptRank !== this.target) return;
    this.streakNow = correct ? 0 : this.streakNow + 1;
    this.sinceSet.push(correct);
    this.recent.push(correct);
    if (this.recent.length > (g.recover?.n ?? 1)) this.recent.shift();

    const canGoDown = this.target > 0;
    const streakHit =
      (g.streak !== undefined && this.streakNow >= g.streak) ||
      (g.earlyStreak !== undefined &&
        this.sinceSet.length <= g.earlyStreak.within &&
        this.streakNow >= g.earlyStreak.streak);
    const earlyHit =
      g.early !== undefined &&
      this.sinceSet.length === g.early.n &&
      this.sinceSet.filter(Boolean).length < g.early.min;
    if (canGoDown && (streakHit || earlyHit)) {
      this.moveTo(this.target - 1);
      this.downs++;
      return;
    }
    if (g.recover && this.t < this.placed && this.recent.length >= g.recover.n) {
      if (this.recent.filter(Boolean).length / g.recover.n >= g.recover.min) {
        this.moveTo(this.t + 1);
        this.ups++;
      }
    }
  }
}

function score(
  v: Variant,
  rng: Rng,
  conceptId: string,
  counts: { correct: number; incorrect: number } | undefined,
  meanB: number,
  guard: LevelGuard,
): number {
  const correct = counts?.correct ?? 0;
  const incorrect = counts?.incorrect ?? 0;
  if (v.core === 'V0') {
    // Today's posterior: Beta(2σ(−b̄) + correct, 2(1 − σ(−b̄)) + incorrect), argmax.
    const m = Math.min(0.9, Math.max(0.1, 1 / (1 + Math.exp(meanB))));
    return sampleBeta(rng, 2 * m + correct, 2 * (1 - m) + incorrect);
  }
  const r = rank(conceptId);
  const m = mu(guard.t, r);
  const s = sampleBeta(rng, S * m + correct, S * (1 - m) + incorrect);
  return -Math.abs(s - mu(guard.t, guard.target)) - LAMBDA * Math.abs(r - guard.target);
}

function pickItem(pool: readonly DueItem[], conceptId: string): DueItem | null {
  const inConcept = pool.filter((c) => c.conceptId === conceptId);
  inConcept.sort(
    (a, b) =>
      (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY) ||
      (a.itemId < b.itemId ? -1 : 1),
  );
  return inConcept[0] ?? null;
}

/** select() with the variant's score: same priority order, same draw order. */
function selectVariant(
  input: SelectionInput,
  rng: Rng,
  v: Variant,
  guardFor: (conceptId: string) => LevelGuard,
): SelectionOutcome {
  const { now, candidates, masteries, eventCounts, config, startConceptId } = input;
  if (candidates.length === 0) return { ok: false, error: 'NO_CANDIDATES' };
  const { unlocked } = computeUnlocked(
    candidates.map((c) => c.conceptId),
    masteries,
    input.prereqEdges,
    config,
  );
  const masteryById = new Map(masteries.map((m) => [m.conceptId, m]));
  const ok = (item: DueItem, reason: SelectionReason): SelectionOutcome => ({
    ok: true,
    result: {
      itemId: item.itemId,
      conceptId: item.conceptId,
      reason,
      isNewConcept: !isStarted(masteryById.get(item.conceptId)),
      unlockedBy: [],
      lastPracticedAt: null,
      debugScores: {},
    },
  });
  const pool = candidates.filter((c) => unlocked.has(c.conceptId));
  if (pool.length === 0) return { ok: false, error: 'NO_CANDIDATES' };

  const due = pool
    .filter((c) => c.dueAt !== null && c.dueAt <= now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || (a.itemId < b.itemId ? -1 : 1));
  if (due[0]) return ok(due[0], 'REVIEW_DUE');

  if (
    startConceptId != null &&
    unlocked.has(startConceptId) &&
    !isStarted(masteryById.get(startConceptId))
  ) {
    const item = pickItem(pool, startConceptId);
    if (item) return ok(item, 'NEW_INTRODUCTION');
  }

  const meanB = meanDifficultyByConcept(pool);
  const countsById = new Map(eventCounts.map((c) => [c.conceptId, c]));
  const all = [...new Set(pool.map((c) => c.conceptId))].sort();
  // V6b: mastered concepts leave the draw (FSRS still reviews them); all mastered → all.
  const open =
    v.core === 'V6b' ? all.filter((id) => !isMastered(masteryById.get(id), config)) : all;
  let best: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const id of open.length > 0 ? open : all) {
    const sc = score(v, rng, id, countsById.get(id), meanB.get(id) ?? 0, guardFor(id));
    if (sc > bestScore) {
      bestScore = sc;
      best = id;
    }
  }
  if (best !== null) {
    const item = pickItem(pool, best);
    if (item) return ok(item, 'NEW_INTRODUCTION');
  }

  const floor = [...pool].sort(
    (a, b) =>
      (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY) ||
      (a.itemId < b.itemId ? -1 : 1),
  )[0];
  return floor ? ok(floor, 'EXPLORATION_FLOOR') : { ok: false, error: 'NO_CANDIDATES' };
}

// ── One learner ─────────────────────────────────────────────────────────────
type Scenario = {
  name: string;
  misplace: number;
  axes: 'both' | 'grammar';
  profiles: readonly Level[];
};
const SCENARIOS: readonly Scenario[] = [
  { name: 'correct', misplace: 0, axes: 'both', profiles: LEVELS },
  { name: 'over+1', misplace: 1, axes: 'both', profiles: ['A2', 'B1'] },
  { name: 'under-1', misplace: -1, axes: 'both', profiles: ['B1', 'B2', 'C1'] },
  { name: 'over+1 grammar', misplace: 1, axes: 'grammar', profiles: ['A2', 'B1'] },
];

type Pick = {
  conceptId: string;
  rank: number;
  isNew: boolean;
  start: boolean;
  correct: boolean;
  /** An unlocked, unstarted concept at the learner's TRUE target level existed. */
  targetAvailable: boolean;
  key: string;
};

/**
 * 'REAL' — the package's select() as today (no learner level); 'REAL_V6B' —
 * the package's select() with learnerLevel from the package's levelGuard and
 * DEFAULT_POLICY_CONFIG: the shipped implementation, checked against CHOSEN.
 */
type Policy = Variant | 'REAL' | 'REAL_V6B';

function runLearner(profile: Level, seed: number, v: Policy, sc: Scenario) {
  const policyRng = makeRng(seedFromString(`policy:${profile}:${seed}`));
  const learnerRng = makeRng(seedFromString(`learner:${profile}:${seed}`));
  const trueRank = RANK[profile];
  const placed = Math.min(3, Math.max(0, trueRank + sc.misplace));
  const placedOf: Record<Axis, number> = {
    GRAMMAR: placed,
    VOCAB: sc.axes === 'both' ? placed : trueRank,
  };
  // assessedLevel: the lower axis.
  const overall = Math.min(placedOf.GRAMMAR, placedOf.VOCAB);
  const guardCfg = typeof v === 'string' ? undefined : v.guard;
  const realOutcomes: LevelGuardOutcome[] = [];
  const guards = {
    ALL: new LevelGuard(overall, guardCfg),
    GRAMMAR: new LevelGuard(placedOf.GRAMMAR, guardCfg),
    VOCAB: new LevelGuard(placedOf.VOCAB, guardCfg),
  };
  const guardFor = (id: string) =>
    guardCfg?.perAxis ? guards[axisOf.get(id) ?? 'VOCAB'] : guards.ALL;

  const levelAt = (r: number) => LEVELS[r] ?? 'A2';
  const assessed = levelAt(overall);
  const { snapshots } = buildBootstrapSnapshots({
    concepts,
    axes: (['GRAMMAR', 'VOCAB'] as const).map((axis) => ({
      axis,
      score: LADDER_SCORE[levelAt(placedOf[axis])],
      answered: 8,
      level: levelAt(placedOf[axis]),
    })),
    assessedLevel: assessed,
  });
  const bkt = new Map<string, BktState>();
  for (const s of snapshots) bkt.set(s.conceptId, { ...initBktState(T0), pKnown: s.pKnown });
  const fsrs = new Map<string, FsrsCardState>();
  const stage = new Map<string, MasteryStage>();
  const counts = new Map<string, { correct: number; incorrect: number }>();
  const practised = new Map<string, number>();
  const picks: Pick[] = [];
  let starved = 0;
  let floors = 0;
  let now = T0;

  for (let step = 0; step < STEPS; step++) {
    if (step > 0) now += step % PER_SESSION === 0 ? DAY : MINUTE;
    const masteries = [...bkt].map(([conceptId, s]) => ({
      conceptId,
      pKnown: s.pKnown,
      observationCount: s.observationCount,
      lastUpdatedAt: s.lastUpdatedAt,
      pForgetLambda: s.pForgetLambda,
    }));
    const startConceptId = masteries.some((m) => m.observationCount > 0)
      ? null
      : pickStartConcept({ concepts, masteries, prereqEdges, level: assessed });
    const candidates: DueItem[] = items.map((i) => {
      const st = fsrs.get(i.itemId);
      return {
        itemId: i.itemId,
        conceptId: i.conceptId,
        irtDiscrimination: i.a,
        irtDifficulty: i.b,
        cefrLevel: i.cefrLevel,
        dueAt: st ? Number(st.dueAt) : null,
        lastReviewAt: st?.lastReviewAt != null ? Number(st.lastReviewAt) : null,
      };
    });
    const { unlocked } = computeUnlocked(
      candidates.map((c) => c.conceptId),
      masteries,
      prereqEdges,
      DEFAULT_POLICY_CONFIG,
    );
    const started = new Set(
      masteries.filter((m) => m.observationCount > 0).map((m) => m.conceptId),
    );
    const trueTarget = Math.min(trueRank, MAX_CONTENT_RANK);
    const targetAvailable = [...unlocked].some((id) => !started.has(id) && rank(id) === trueTarget);
    const input: SelectionInput = {
      userId: `sim-${profile}-${seed}`,
      now,
      masteries,
      eventCounts: [...counts].map(([conceptId, c]) => ({ conceptId, ...c })),
      prereqEdges,
      candidates,
      config: DEFAULT_POLICY_CONFIG,
      startConceptId,
    };
    const out =
      v === 'REAL'
        ? select(input, policyRng)
        : v === 'REAL_V6B'
          ? select({ ...input, ...realLevel(assessed, realOutcomes) }, policyRng)
          : selectVariant(input, policyRng, v, guardFor);
    if (!out.ok) {
      starved++;
      continue;
    }
    const { itemId, conceptId, reason, isNewConcept } = out.result;
    if (reason === 'EXPLORATION_FLOOR') floors++;
    const item = itemById.get(itemId);
    if (!item) throw new Error(`unknown item ${itemId}`);
    const n = practised.get(conceptId) ?? 0;
    const correct = learnerRng.next() < truthP(trueRank, conceptId, n);
    practised.set(conceptId, n + 1);
    const c = counts.get(conceptId) ?? { correct: 0, incorrect: 0 };
    counts.set(conceptId, {
      correct: c.correct + (correct ? 1 : 0),
      incorrect: c.incorrect + (correct ? 0 : 1),
    });
    if (typeof v !== 'string') guardFor(conceptId).observe(rank(conceptId), correct);
    realOutcomes.push({ rank: CEFR_RANK[conceptLevel(conceptId)], correct });
    const fold = applyItemAttempted(
      {
        bkt: bkt.get(conceptId) ?? null,
        fsrs: fsrs.get(itemId) ?? null,
        stage: stage.get(conceptId) ?? null,
      },
      {
        itemId,
        conceptId,
        correct,
        timeMs: null,
        rating: correct ? 'GOOD' : 'AGAIN',
        irt: { a: item.a, b: item.b },
      },
      BigInt(now),
    );
    bkt.set(conceptId, fold.bkt);
    fsrs.set(itemId, fold.fsrs);
    stage.set(conceptId, fold.stage);
    picks.push({
      conceptId,
      rank: rank(conceptId),
      isNew: isNewConcept,
      start: startConceptId === conceptId && isNewConcept,
      correct,
      targetAvailable,
      key: `${conceptId}|${reason}|${correct}`,
    });
  }
  const used = guardCfg?.perAxis ? [guards.GRAMMAR, guards.VOCAB] : [guards.ALL];
  return {
    picks,
    starved,
    floors,
    downs: used.reduce((s, g) => s + g.downs, 0),
    ups: used.reduce((s, g) => s + g.ups, 0),
  };
}

// ── Variants ────────────────────────────────────────────────────────────────
/**
 * The stage-2b candidate (HANDOFF §7): the best grid point that passes
 * criterion 3 at 2000 seeds. Criterion 7 is still open — see HANDOFF §8 #19.
 */
const CHOSEN: Variant = {
  name: 'V6b + guard (chosen)',
  core: 'V6b',
  guard: { streak: 4, early: { n: 7, min: 4 }, recover: { n: 12, min: 0.85 } },
};
const BASE: Variant[] = [
  { name: 'V0 today', core: 'V0' },
  { name: 'V6b no guard', core: 'V6b' },
  CHOSEN,
];
const grid: Variant[] = [];
for (const streak of [3, 4])
  for (const early of [
    { n: 6, min: 3 },
    { n: 7, min: 3 },
    { n: 7, min: 4 },
  ])
    for (const recover of [
      { n: 10, min: 0.85 },
      { n: 12, min: 0.85 },
      { n: 12, min: 0.8 },
    ])
      for (const earlyStreak of [undefined, { streak: 2, within: 6 }])
        grid.push({
          name: `G1s${streak}${earlyStreak ? '+e2/6' : ''} G2 ${early.n}<${early.min} R ${recover.n}@${recover.min}`,
          core: 'V6b',
          guard: { streak, early, recover, earlyStreak },
        });
// V0 always runs: criterion 7 is relative to it.
const VARIANTS = [
  BASE[0] as Variant,
  ...[...BASE.slice(1), ...(GRID ? grid : [])].filter((v) => !ONLY || v.name.includes(ONLY)),
];

// ── Run ─────────────────────────────────────────────────────────────────────
type Row = {
  onTarget: number;
  above: number;
  first3: number;
  accuracy: number;
  topics: number;
  downs: number;
  ups: number;
  starved: number;
  floors: number;
};
const pct = (n: number, d: number) => (d === 0 ? Number.NaN : (100 * n) / d);

function measure(v: Variant | 'REAL', sc: Scenario, profile: Level): Row {
  const target = Math.min(RANK[profile], MAX_CONTENT_RANK);
  let avail = 0,
    on = 0,
    above = 0,
    f3 = 0,
    f3on = 0,
    total = 0,
    right = 0;
  let topics = 0,
    downs = 0,
    ups = 0,
    starved = 0,
    floors = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = runLearner(profile, seed, v, sc);
    starved += r.starved;
    floors += r.floors;
    downs += r.downs;
    ups += r.ups;
    topics += new Set(r.picks.map((p) => p.conceptId)).size;
    for (const p of r.picks) {
      total++;
      if (p.correct) right++;
    }
    const intros = r.picks.filter((p) => p.isNew && !p.start);
    for (const p of intros) {
      if (!p.targetAvailable) continue;
      avail++;
      if (p.rank === target) on++;
      if (p.rank > target) above++;
    }
    for (const p of intros.slice(0, 3)) {
      f3++;
      if (p.rank === target) f3on++;
    }
  }
  return {
    onTarget: pct(on, avail),
    above: pct(above, avail),
    first3: pct(f3on, f3),
    accuracy: pct(right, total),
    topics: topics / SEEDS,
    downs: downs / SEEDS,
    ups: ups / SEEDS,
    starved,
    floors,
  };
}

const traceKey = (v: Policy, sc: Scenario, profile: Level, seed: number) =>
  runLearner(profile, seed, v, sc)
    .picks.map((p) => p.key)
    .join(';');

// Parity: the copy of select() on today's policy must match the real one.
const correct = SCENARIOS[0] as Scenario;
let mismatch = 0;
for (const profile of LEVELS)
  for (let seed = 0; seed < 50; seed++)
    if (
      traceKey('REAL', correct, profile, seed) !==
      traceKey(BASE[0] as Variant, correct, profile, seed)
    )
      mismatch++;
// The shipped V6b + level guard must match the calibrated copy, pick for pick.
let shipped = 0;
let shippedRuns = 0;
for (const sc of SCENARIOS)
  for (const profile of sc.profiles)
    for (let seed = 0; seed < 25; seed++) {
      shippedRuns++;
      if (traceKey('REAL_V6B', sc, profile, seed) !== traceKey(CHOSEN, sc, profile, seed))
        shipped++;
    }
console.info(
  `shipped select()+levelGuard vs calibrated copy: ${shipped}/${shippedRuns} trajectories differ`,
);
let nondeterministic = 0;
for (const v of VARIANTS)
  for (let seed = 0; seed < 10; seed++) {
    // Two independent runs of the same seed: any hidden state or Math.random() shows here.
    const first = traceKey(v, correct, 'B1', seed);
    const again = traceKey(v, correct, 'B1', seed);
    if (first !== again) nondeterministic++;
  }
console.info(
  `parity with select(): ${mismatch}/200 trajectories differ · reruns differing: ${nondeterministic}/${10 * VARIANTS.length}`,
);
if (mismatch > 0 || shipped > 0) {
  console.error(
    'The select() copy has drifted from the real one — fix it before trusting any number.',
  );
  process.exit(1);
}

console.info(`seeds=${SEEDS} steps=${STEPS} variants=${VARIANTS.length}\n`);
const f = (x: number) => (Number.isNaN(x) ? '—' : x.toFixed(1));
const results = new Map<string, Row>();
for (const v of VARIANTS) {
  for (const sc of SCENARIOS) {
    for (const profile of sc.profiles) {
      const row = measure(v, sc, profile);
      results.set(`${v.name}|${sc.name}|${profile}`, row);
    }
  }
}

console.info(
  'variant | scenario | profile | on target % | above % | first 3 on target % | accuracy % | topics | downs | ups',
);
for (const v of VARIANTS)
  for (const sc of SCENARIOS)
    for (const profile of sc.profiles) {
      const r = results.get(`${v.name}|${sc.name}|${profile}`) as Row;
      console.info(
        [
          v.name,
          sc.name,
          profile,
          f(r.onTarget),
          f(r.above),
          f(r.first3),
          f(r.accuracy),
          r.topics.toFixed(1),
          r.downs.toFixed(2),
          r.ups.toFixed(2),
        ].join(' | '),
      );
    }

// ── Acceptance criteria ─────────────────────────────────────────────────────
const get = (v: string, sc: string, p: Level) => results.get(`${v}|${sc}|${p}`) as Row;
const v0 = (BASE[0] as Variant).name;
console.info(
  '\nvariant | C1 starve | C3 on target ≥ 90 | C4 above ≤ 5 | C5 topics ≥ 12 | C6 acc A2–B1 70–85 | C7 over+1: acc ≥ 70 & above ≤ V0 + 10 | all',
);
for (const v of VARIANTS) {
  if (v.core === 'V0') continue;
  const rows = SCENARIOS.flatMap((sc) => sc.profiles.map((p) => get(v.name, sc.name, p)));
  const c1 = rows.every((r) => r.starved === 0);
  const c3 = LEVELS.every((p) => get(v.name, 'correct', p).onTarget >= 90);
  const c4 = LEVELS.every((p) => !(get(v.name, 'correct', p).above > 5));
  const c5 = LEVELS.every((p) => get(v.name, 'correct', p).topics >= 12);
  const c6 = (['A2', 'B1'] as const).every((p) => {
    const a = get(v.name, 'correct', p).accuracy;
    return a >= 70 && a <= 85;
  });
  const c7detail = (['A2', 'B1'] as const).map((p) => {
    const r = get(v.name, 'over+1', p);
    const limit = get(v0, 'over+1', p).above + 10;
    return { p, ok: r.accuracy >= 70 && r.above <= limit, acc: r.accuracy, above: r.above, limit };
  });
  const c7 = c7detail.every((d) => d.ok);
  const mark = (b: boolean) => (b ? 'pass' : 'FAIL');
  const c3min = Math.min(...LEVELS.map((p) => get(v.name, 'correct', p).onTarget));
  console.info(
    [
      v.name,
      mark(c1),
      `${mark(c3)} (min ${c3min.toFixed(1)})`,
      mark(c4),
      mark(c5),
      mark(c6),
      `${mark(c7)} (${c7detail.map((d) => `${d.p} acc ${d.acc.toFixed(1)} above ${d.above.toFixed(1)}≤${d.limit.toFixed(1)}`).join('; ')})`,
      mark(c1 && c3 && c4 && c5 && c6 && c7),
    ].join(' | '),
  );
}
