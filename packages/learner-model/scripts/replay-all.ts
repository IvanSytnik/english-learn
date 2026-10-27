/**
 * Rebuild every learner's projections (ConceptMastery + ItemReviewState)
 * from LearnerEvent with the current fold — after a deliberate change to the
 * model (§8 #19: 4PL observation model). Each user goes through replayUser:
 * one transaction under the per-user advisory lock, so a concurrent
 * recordOutcome waits instead of folding onto half-written projections.
 *
 * Usage (from packages/learner-model):
 *   pnpm replay:all            # dry run: replays every user, rolls each back, prints the drift
 *   pnpm replay:all --apply    # same, but commits
 *
 * Connection: DIRECT_URL, else DATABASE_URL (packages/db/.env by default).
 * Prod (Ivan only, direct non-pooler URL — HANDOFF §5):
 *   DATABASE_URL="$PROD_DIRECT" DIRECT_URL="$PROD_DIRECT" pnpm --filter @englishlearn/learner-model replay:all
 *
 * A user whose replay fails keeps the old projections (the transaction rolls
 * back); the run carries on and exits 1 at the end.
 */

import { createPrismaClient } from '@englishlearn/db/create-client';
import { DEFAULT_POLICY_CONFIG } from '../src/policy';
import {
  createPrismaLearnerDb,
  type LearnerModelDb,
  type ReplayResult,
  replayUser,
} from '../src/service';

const apply = process.argv.includes('--apply');
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DIRECT_URL or DATABASE_URL is required');
  process.exit(1);
}

const prisma = createPrismaClient(url);
// One transaction per user upserting every row: at ~100 ms a round trip to
// Neon a heavy learner outlasts Prisma's 5 s default (dev: slowest 3.2 s).
const db = createPrismaLearnerDb(prisma, { txTimeoutMs: 120_000 });

/** Thrown inside the transaction to roll a dry run back. */
class DryRunRollback extends Error {}

type MasteryRow = { conceptId: string; pKnown: number; displayStage: string };

const GATE = DEFAULT_POLICY_CONFIG.prereqThreshold;

function hostOf(connection: string): string {
  try {
    return new URL(connection).host;
  } catch {
    return '<unparseable url>';
  }
}

/**
 * replayUser on a db whose transaction also reads the rebuilt rows before it
 * ends — and, on a dry run, then throws so nothing is committed.
 */
async function replayObserved(
  userId: string,
  conceptIds: readonly string[],
): Promise<{ result: ReplayResult; after: MasteryRow[] }> {
  const seen: { result?: ReplayResult; after: MasteryRow[] } = { after: [] };
  const observed: LearnerModelDb = {
    ...db,
    runInTx: (fn) =>
      db.runInTx(async (tx) => {
        const r = await fn(tx);
        seen.after = await tx.getConceptMasteries(userId, conceptIds);
        // replayUser is the only caller here, so r is its ReplayResult.
        seen.result = r as ReplayResult;
        if (!apply) throw new DryRunRollback();
        return r;
      }),
  };
  try {
    await replayUser(observed, userId);
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }
  if (!seen.result) throw new Error('replayUser returned no result');
  return { result: seen.result, after: seen.after };
}

async function main() {
  console.info(
    `→ replay-all on ${hostOf(url as string)} — ${apply ? 'APPLY' : 'dry run (rolled back)'}`,
  );
  const started = Date.now();

  const users = (
    await prisma.learnerEvent.findMany({
      distinct: ['userId'],
      select: { userId: true },
      orderBy: { userId: 'asc' },
    })
  ).map((u) => u.userId);
  const conceptIds = (await prisma.concept.findMany({ select: { id: true } })).map((c) => c.id);
  console.info(`  ${users.length} users with events, ${conceptIds.length} concepts`);

  const total = {
    users: 0,
    failed: 0,
    events: 0,
    conceptsWritten: 0,
    itemsWritten: 0,
    conceptRowsBefore: 0,
    itemRowsBefore: 0,
    pKnownChanged: 0,
    stageChanged: 0,
    crossedGateUp: 0,
    crossedGateDown: 0,
    maxAbsDelta: 0,
  };
  let slowest = { userId: '', ms: 0 };

  for (const userId of users) {
    const t0 = Date.now();
    try {
      const [before, itemRowsBefore] = await Promise.all([
        prisma.conceptMastery.findMany({
          where: { userId },
          select: { conceptId: true, pKnown: true, displayStage: true },
        }),
        prisma.itemReviewState.count({ where: { userId } }),
      ]);
      const { result, after } = await replayObserved(userId, conceptIds);

      const afterById = new Map(after.map((r) => [r.conceptId, r]));
      for (const b of before) {
        const a = afterById.get(b.conceptId);
        const pAfter = a?.pKnown ?? 0;
        const delta = Math.abs(pAfter - b.pKnown);
        if (delta > 1e-9) total.pKnownChanged += 1;
        if (a?.displayStage !== b.displayStage) total.stageChanged += 1;
        if (b.pKnown < GATE && pAfter >= GATE) total.crossedGateUp += 1;
        if (b.pKnown >= GATE && pAfter < GATE) total.crossedGateDown += 1;
        total.maxAbsDelta = Math.max(total.maxAbsDelta, delta);
      }

      total.users += 1;
      total.events += result.eventsProcessed;
      total.conceptsWritten += result.conceptsWritten;
      total.itemsWritten += result.itemsWritten;
      total.conceptRowsBefore += before.length;
      total.itemRowsBefore += itemRowsBefore;
    } catch (err) {
      total.failed += 1;
      // Prisma messages carry a code frame; the cause is the last line.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${userId}: ${message.trim().split('\n').at(-1)}`);
    }
    const ms = Date.now() - t0;
    if (ms > slowest.ms) slowest = { userId, ms };
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.info(`  ✓ ${total.users} users replayed, ${total.failed} failed, ${total.events} events`);
  console.info(
    `    ConceptMastery: ${total.conceptRowsBefore} → ${total.conceptsWritten} rows, ` +
      `pKnown changed ${total.pKnownChanged} (max |Δ| ${total.maxAbsDelta.toFixed(4)}), ` +
      `stage changed ${total.stageChanged}, crossed ${GATE} up ${total.crossedGateUp} / down ${total.crossedGateDown}`,
  );
  console.info(`    ItemReviewState: ${total.itemRowsBefore} → ${total.itemsWritten} rows`);
  console.info(`    ${seconds} s total, slowest user ${slowest.ms} ms`);
  console.info(apply ? '✓ Applied.' : '✓ Dry run — nothing written. Re-run with --apply.');
  if (total.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
