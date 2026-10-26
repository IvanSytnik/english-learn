import { createPrismaClient } from '@englishlearn/db/create-client';
import { type Practice, PracticeSchema } from '@englishlearn/db/schemas';

/**
 * Read-only database checks for e2e: what the UI cannot show (yet) — that an
 * attempt was or was not created, that the bootstrap reached the learner
 * model. Never writes.
 *
 * CI sets DATABASE_URL for the job; locally it comes from apps/web/.env, the
 * same database the production build under test uses.
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

/** Call from afterAll in every spec that uses these checks. */
export async function closeDb() {
  await client?.$disconnect();
  client = undefined;
}

/** The learner's diagnostic footprint, by e-mail. */
export async function diagnosticFootprint(email: string) {
  const user = await db().user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const [attempts, bootstrapEvents, priors, profile] = await Promise.all([
    db().diagnosticAttempt.findMany({
      where: { userId: user.id },
      select: { status: true, assessedLevel: true, _count: { select: { answers: true } } },
    }),
    db().learnerEvent.count({ where: { userId: user.id, type: 'LEARNER_BOOTSTRAPPED' } }),
    // Only a bootstrap writes ConceptMastery rows with no observation.
    db().conceptMastery.count({ where: { userId: user.id, observationCount: 0 } }),
    db().studentProfile.findUnique({
      where: { userId: user.id },
      select: { nativeLanguage: true },
    }),
  ]);
  return {
    attempts: attempts.map((a) => ({
      status: a.status,
      assessedLevel: a.assessedLevel,
      answers: a._count.answers,
    })),
    bootstrapEvents,
    priors,
    nativeLanguage: profile?.nativeLanguage ?? null,
  };
}

/**
 * Published practice questions with their keys. The key never reaches the
 * browser; the test finds the question on screen and looks its key up here.
 */
export async function practiceQuestions(): Promise<{ id: string; practice: Practice }[]> {
  const items = await db().item.findMany({
    where: { status: 'PUBLISHED' },
    select: { id: true, content: true },
  });
  return items.flatMap((item) => {
    const parsed = PracticeSchema.safeParse((item.content as { practice?: unknown }).practice);
    return parsed.success ? [{ id: item.id, practice: parsed.data }] : [];
  });
}

/** The learner's ITEM_ATTEMPTED payloads, oldest first. */
export async function itemAttempts(email: string) {
  const user = await db().user.findUniqueOrThrow({ where: { email }, select: { id: true } });
  const events = await db().learnerEvent.findMany({
    where: { userId: user.id, type: 'ITEM_ATTEMPTED' },
    orderBy: { occurredAt: 'asc' },
    select: { payload: true },
  });
  return events.map((e) => e.payload as Record<string, unknown>);
}
