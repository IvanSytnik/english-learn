/**
 * TEMPORARY live smoke script for Diagnostic v2 bootstrap. DELETE after use.
 *
 * Run from packages/learner-model:
 *   pnpm exec tsx scripts/smoke-diagnostic-v2.ts
 *
 * Creates one throwaway user, exercises bootstrap → strictly-once → replay →
 * selectNext against the real Neon DB, prints evidence for each step, then
 * deletes everything it created (cascade via User onDelete: Cascade).
 */

import { PrismaClient } from '@englishlearn/db/generated/client/index.js';
import type { BootstrapConcept, DiagnosticAnswerFact } from '../src/diagnostic';
import { createBootstrapService } from '../src/service/bootstrap-service';
import { createPrismaLearnerDb } from '../src/service/prisma-db';
import { replayUser } from '../src/service/replay';
import { createSelectionService } from '../src/service/selection-service';

const prisma = new PrismaClient();
const db = createPrismaLearnerDb(prisma);

function log(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  // ── 1. Fresh test user ────────────────────────────────────────────────────
  log('1. Create fresh test user');
  const user = await prisma.user.create({
    data: {
      email: `diagnostic-v2-smoke-${Date.now()}@internal.test`,
      role: 'STUDENT',
      locale: 'en',
      name: 'Diagnostic v2 smoke test (temporary)',
    },
  });
  const userId = user.id;
  console.log('userId:', userId, user.email);

  const preEvents = await prisma.learnerEvent.count({ where: { userId } });
  const preMastery = await prisma.conceptMastery.count({ where: { userId } });
  console.log('pre-state: LearnerEvent =', preEvents, ' ConceptMastery =', preMastery);
  if (preEvents !== 0 || preMastery !== 0) {
    throw new Error('Fresh user is not actually clean — aborting.');
  }

  try {
    await runSteps2Through6(userId);
  } finally {
    await cleanup(userId);
  }
}

async function runSteps2Through6(userId: string) {
  // ── 2. Synthetic diagnostic answers with explicit axis asymmetry ─────────
  log('2. Build synthetic answers (grammar strong 5/6, vocab weak 1/5)');
  const answers: DiagnosticAnswerFact[] = [
    { axis: 'GRAMMAR', correct: true },
    { axis: 'GRAMMAR', correct: true },
    { axis: 'GRAMMAR', correct: true },
    { axis: 'GRAMMAR', correct: true },
    { axis: 'GRAMMAR', correct: true },
    { axis: 'GRAMMAR', correct: false }, // grammar 5/6
    { axis: 'VOCAB', correct: true },
    { axis: 'VOCAB', correct: false },
    { axis: 'VOCAB', correct: false },
    { axis: 'VOCAB', correct: false },
    { axis: 'VOCAB', correct: false }, // vocab 1/5
  ];
  console.log('grammar 5/6 = 0.833, vocab 1/5 = 0.2');

  const conceptRows = await prisma.concept.findMany({
    select: { id: true, category: true, cefrLevel: true },
    orderBy: { id: 'asc' },
  });
  const concepts: BootstrapConcept[] = conceptRows.map((c) => ({
    id: c.id,
    category: c.category,
    cefrLevel: c.cefrLevel,
  }));
  console.log(`concepts pulled from DB: ${concepts.length}`);

  // ── 3. bootstrapFromDiagnostic ────────────────────────────────────────────
  log('3. bootstrapFromDiagnostic (assessedLevel=B1)');
  const bootstrapSvc = createBootstrapService(db);
  const res1 = await bootstrapSvc.bootstrapFromDiagnostic({
    userId,
    diagnosticAttemptId: 'smoke-attempt-1',
    assessedLevel: 'B1',
    answers,
    concepts,
  });
  console.log('res1:', JSON.stringify(res1, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  if (!res1.ok) throw new Error(`bootstrap failed unexpectedly: ${res1.error}`);

  const eventCount1 = await prisma.learnerEvent.count({
    where: { userId, type: 'LEARNER_BOOTSTRAPPED' },
  });
  console.log('LearnerEvent(LEARNER_BOOTSTRAPPED) count:', eventCount1);
  if (eventCount1 !== 1) throw new Error(`expected exactly 1 event, got ${eventCount1}`);

  const masteryRows = await prisma.conceptMastery.findMany({
    where: { userId },
    include: { concept: { select: { category: true } } },
    orderBy: { conceptId: 'asc' },
  });
  console.log(`ConceptMastery rows: ${masteryRows.length}`);
  for (const m of masteryRows) {
    console.log(
      `  ${m.concept.category.padEnd(8)} ${m.conceptId.padEnd(32)} pKnown=${m.pKnown.toFixed(4)} observationCount=${m.observationCount}`,
    );
  }

  const grammarPKnown = masteryRows.filter((m) => m.concept.category === 'GRAMMAR').map((m) => m.pKnown);
  const vocabPKnown = masteryRows.filter((m) => m.concept.category === 'VOCAB').map((m) => m.pKnown);
  const minGrammar = Math.min(...grammarPKnown);
  const maxVocab = Math.max(...vocabPKnown);
  console.log(`min(grammar pKnown) = ${minGrammar.toFixed(4)}  vs  max(vocab pKnown) = ${maxVocab.toFixed(4)}`);
  if (!(minGrammar > maxVocab)) {
    throw new Error('ASYMMETRY FAILED: weakest grammar concept is not above strongest vocab concept');
  }
  console.log('✓ asymmetry confirmed: every grammar concept outranks every vocab concept');

  const overCeiling = masteryRows.filter((m) => m.pKnown > 0.6);
  console.log('rows exceeding ceiling 0.6:', overCeiling.length);
  if (overCeiling.length > 0) throw new Error('ceiling violated');

  const nonZeroObs = masteryRows.filter((m) => m.observationCount !== 0);
  console.log('rows with observationCount != 0:', nonZeroObs.length);
  if (nonZeroObs.length > 0) throw new Error('observationCount invariant violated');

  // ── 4. Strictly-once guard ────────────────────────────────────────────────
  log('4. Strictly-once: second bootstrap call must be rejected');
  const snapshotBefore = new Map(masteryRows.map((m) => [m.conceptId, m.pKnown]));
  const res2 = await bootstrapSvc.bootstrapFromDiagnostic({
    userId,
    diagnosticAttemptId: 'smoke-attempt-2',
    assessedLevel: 'C1', // deliberately different — must NOT overwrite
    answers,
    concepts,
  });
  console.log('res2:', res2);
  if (res2.ok !== false || res2.error !== 'ALREADY_BOOTSTRAPPED') {
    throw new Error(`expected ALREADY_BOOTSTRAPPED, got ${JSON.stringify(res2)}`);
  }
  const eventCount2 = await prisma.learnerEvent.count({ where: { userId } });
  console.log('LearnerEvent count after 2nd call:', eventCount2);
  if (eventCount2 !== 1) throw new Error('a second event was written — strictly-once guard broken');

  const masteryAfterSecondCall = await prisma.conceptMastery.findMany({
    where: { userId },
    select: { conceptId: true, pKnown: true },
  });
  const unchanged = masteryAfterSecondCall.every(
    (m) => snapshotBefore.get(m.conceptId) === m.pKnown,
  );
  console.log('mastery unchanged after 2nd call:', unchanged);
  if (!unchanged) throw new Error('mastery mutated by a rejected bootstrap call');

  // ── 5. Replay bit-exactness ───────────────────────────────────────────────
  log('5. Replay from event log, compare against live-path snapshot');
  const beforeReplay = new Map(
    masteryRows.map((m) => [
      m.conceptId,
      { pKnown: m.pKnown, pLearn: m.pLearn, pSlip: m.pSlip, pGuess: m.pGuess, pForgetLambda: m.pForgetLambda, lastUpdatedAt: m.lastUpdatedAt, observationCount: m.observationCount },
    ]),
  );

  const replayResult = await replayUser(db, userId);
  console.log('replayResult:', replayResult);

  const afterReplay = await prisma.conceptMastery.findMany({ where: { userId } });
  console.log('ConceptMastery rows after replay:', afterReplay.length);

  let replayMismatch = false;
  for (const m of afterReplay) {
    const before = beforeReplay.get(m.conceptId);
    if (!before) {
      replayMismatch = true;
      console.log(`  ✗ ${m.conceptId}: present after replay but missing before`);
      continue;
    }
    const same =
      before.pKnown === m.pKnown &&
      before.pLearn === m.pLearn &&
      before.pSlip === m.pSlip &&
      before.pGuess === m.pGuess &&
      before.pForgetLambda === m.pForgetLambda &&
      before.lastUpdatedAt === m.lastUpdatedAt &&
      before.observationCount === m.observationCount;
    if (!same) {
      replayMismatch = true;
      console.log(`  ✗ ${m.conceptId}: mismatch before=${JSON.stringify(before)} after=${JSON.stringify({ ...m })}`);
    }
  }
  if (afterReplay.length !== beforeReplay.size) replayMismatch = true;
  console.log(replayMismatch ? '✗ REPLAY MISMATCH' : '✓ replay is bit-exact with the live path');
  if (replayMismatch) throw new Error('replay did not reproduce the live-path ConceptMastery');

  // ── 6. selectNext: does bootstrap asymmetry influence selection? ─────────
  log('6. selectNext — repeated draws, grammar vs vocab');
  const selectionSvc = createSelectionService(db);
  const conceptCategory = new Map(conceptRows.map((c) => [c.id, c.category]));

  const N_DRAWS = 2000;
  const winners: Record<string, number> = {};
  const grammarScoreSum: number[] = [];
  const vocabScoreSum: number[] = [];
  // Per-concept means isolate whether any INDIVIDUAL concept is favored, not
  // just the category pool (grammar has 12 arms, vocab has 3 — pool-size
  // alone biases raw argmax-win counts, so that tally is NOT reliable evidence).
  const perConceptScores = new Map<string, number[]>();

  for (let seed = 0; seed < N_DRAWS; seed++) {
    const outcome = await selectionSvc.selectNext({ userId, seed, nowMs: Date.now() });
    if (!outcome.ok) {
      console.log(`  seed=${seed}: NO_CANDIDATES`);
      continue;
    }
    const { conceptId, reason, debugScores } = outcome.result;
    const cat = conceptCategory.get(conceptId) ?? 'UNKNOWN';
    winners[cat] = (winners[cat] ?? 0) + 1;
    if (seed === 0) {
      console.log(`  seed=0 picked ${conceptId} (${cat}) via ${reason}`);
      console.log('  debugScores sample:', JSON.stringify(debugScores, null, 2));
    }

    for (const [cid, score] of Object.entries(debugScores)) {
      const c = conceptCategory.get(cid);
      if (c === 'GRAMMAR') grammarScoreSum.push(score);
      else if (c === 'VOCAB') vocabScoreSum.push(score);
      const arr = perConceptScores.get(cid) ?? [];
      arr.push(score);
      perConceptScores.set(cid, arr);
    }
  }

  console.log(`\nWinning category tally over ${N_DRAWS} draws (confounded by pool size 12 vs 3):`, winners);

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const stderr = (xs: number[]) => {
    const m = mean(xs);
    const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
    return Math.sqrt(variance / xs.length);
  };

  console.log('\nPer-concept mean Thompson sample ± 1 SE (unconfounded by pool size):');
  const sortedConcepts = [...perConceptScores.keys()].sort();
  for (const cid of sortedConcepts) {
    const scores = perConceptScores.get(cid)!;
    const cat = conceptCategory.get(cid);
    console.log(`  ${cat!.padEnd(8)} ${cid.padEnd(32)} ${mean(scores).toFixed(4)} ± ${stderr(scores).toFixed(4)} (n=${scores.length})`);
  }

  const avgGrammarScore = mean(grammarScoreSum);
  const avgVocabScore = mean(vocabScoreSum);
  const seGrammar = stderr(grammarScoreSum);
  const seVocab = stderr(vocabScoreSum);
  console.log(
    `\navg Thompson sample — grammar: ${avgGrammarScore.toFixed(4)} ± ${seGrammar.toFixed(4)} (n=${grammarScoreSum.length}), vocab: ${avgVocabScore.toFixed(4)} ± ${seVocab.toFixed(4)} (n=${vocabScoreSum.length})`,
  );
  const diff = avgVocabScore - avgGrammarScore;
  const combinedSe = Math.sqrt(seGrammar ** 2 + seVocab ** 2);
  console.log(`difference (vocab - grammar) = ${diff.toFixed(4)}, combined SE = ${combinedSe.toFixed(4)}, z = ${(diff / combinedSe).toFixed(2)}`);
  console.log(
    Math.abs(diff / combinedSe) > 3
      ? '=> statistically significant difference — bootstrap asymmetry DOES appear to bias the Thompson draw'
      : '=> difference is within noise (|z| <= 3) — NO evidence that bootstrap pKnown influences the Thompson draw; consistent with posterior.ts never reading ConceptMastery.pKnown',
  );
}

/** Always runs (from a finally block), even if an assertion above threw. */
async function cleanup(userId: string) {
  log('7. Cleanup');
  await prisma.user.delete({ where: { id: userId } });
  const postEvents = await prisma.learnerEvent.count({ where: { userId } });
  const postMastery = await prisma.conceptMastery.count({ where: { userId } });
  const postUser = await prisma.user.findUnique({ where: { id: userId } });
  console.log('post-cleanup: LearnerEvent =', postEvents, ' ConceptMastery =', postMastery, ' User =', postUser);
  if (postEvents !== 0 || postMastery !== 0 || postUser !== null) {
    throw new Error('CLEANUP INCOMPLETE — manual intervention required for userId ' + userId);
  }
  console.log('✓ test user and all derived rows removed');
}

main()
  .catch((err) => {
    console.error('\nSMOKE TEST FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
