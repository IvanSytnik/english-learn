import { createPrismaClient } from '@englishlearn/db/create-client';
import { getPublishedVocabLexemes } from '@englishlearn/db/queries/vocab-lexemes';
import {
  createLearnerService,
  createPrismaLearnerDb,
  type RecordVocabOutcomeInput,
} from '@englishlearn/learner-model/service';

/**
 * Writes for e2e: learner history the UI cannot make in a test's time — a
 * word answered days ago. helpers/db.ts stays read-only; this file writes,
 * and only through the learner service (the one write path to the review
 * state), with an explicit occurredAt. An explicit moment must be after the
 * user's latest event, so seed a fresh learner before anything else they do.
 *
 * Same database as the build under test: DATABASE_URL (CI), else apps/web/.env.
 */

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('.env');
  } catch {
    // No .env: createPrismaClient reports the missing URL on first use.
  }
}

let client: ReturnType<typeof createPrismaClient> | undefined;

function db() {
  client ??= createPrismaClient(process.env.DATABASE_URL);
  return client;
}

/** Call from afterAll in every spec that seeds. */
export async function closeSeedDb() {
  await client?.$disconnect();
  client = undefined;
}

/** The published vocabulary pool, as the app loads it (lib/vocab-pool.ts). */
export async function vocabPool() {
  return (await getPublishedVocabLexemes(db())).rows;
}

/** A user's id, by e-mail. */
export async function userIdOf(email: string) {
  return (await db().user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
}

/** Record one answer at its explicit moment; throws unless it was recorded. */
export async function recordVocabAnswer(input: RecordVocabOutcomeInput & { occurredAtMs: bigint }) {
  const recorded = await createLearnerService(createPrismaLearnerDb(db())).recordVocabOutcome(
    input,
  );
  if (!recorded.ok) throw new Error(`vocab answer not recorded: ${recorded.error}`);
}

/** The word's review state after seeding: the rung and the card seed it implies. */
export async function reviewState(userId: string, itemId: string) {
  return db().itemReviewState.findUniqueOrThrow({
    where: { userId_itemId: { userId, itemId } },
    select: { stability: true, cardStatus: true, lastReviewAt: true, dueAt: true },
  });
}
