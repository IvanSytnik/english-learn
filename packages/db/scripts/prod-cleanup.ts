// packages/db/scripts/prod-cleanup.ts
//
// Wipes ALL user data from the target database. Content is preserved.
//
// Usage (from packages/db):
//   DATABASE_URL="<direct url>" DIRECT_URL="<direct url>" \
//     pnpm exec tsx scripts/prod-cleanup.ts            # dry run: host + counts only
//   DATABASE_URL="<direct url>" DIRECT_URL="<direct url>" \
//     pnpm exec tsx scripts/prod-cleanup.ts --confirm  # actually delete
//
// Deleted:   User and everything hanging off it (auth, profile, attempts,
//            diagnostics, learner events, BKT/FSRS projections) + VerificationToken.
// Preserved: Concept, ConceptEdge, Item, DiagnosticItem, SkillTag and all
//            *Exercise tables.
//
// Note: exercise/diagnostic-item authorship columns (createdById / reviewedById)
// are nullable with ON DELETE SET NULL, so the content rows survive but lose
// their author reference. That is the only mutation applied to content.
//
// Deliberately NOT wrapped in a transaction: a failed tx against Neon can leave
// an advisory lock behind. The deletes are ordered by FK dependency and the
// script is idempotent — re-running it is the recovery path.

import { PrismaClient } from '../src/generated/client';

const prisma = new PrismaClient({ log: ['error'] });

/** Deletion order: children before parents. */
const STEPS = [
  { label: 'LearnerEvent', run: () => prisma.learnerEvent.deleteMany() },
  { label: 'ItemReviewState', run: () => prisma.itemReviewState.deleteMany() },
  { label: 'ConceptMastery', run: () => prisma.conceptMastery.deleteMany() },
  { label: 'DiagnosticAnswer', run: () => prisma.diagnosticAnswer.deleteMany() },
  { label: 'DiagnosticAttempt', run: () => prisma.diagnosticAttempt.deleteMany() },
  { label: 'VocabAttempt', run: () => prisma.vocabAttempt.deleteMany() },
  { label: 'GrammarAttempt', run: () => prisma.grammarAttempt.deleteMany() },
  { label: 'ListeningAttempt', run: () => prisma.listeningAttempt.deleteMany() },
  { label: 'SkillLevel', run: () => prisma.skillLevel.deleteMany() },
  { label: 'StudentProfile', run: () => prisma.studentProfile.deleteMany() },
  { label: 'Session', run: () => prisma.session.deleteMany() },
  { label: 'Account', run: () => prisma.account.deleteMany() },
  { label: 'VerificationToken', run: () => prisma.verificationToken.deleteMany() },
  { label: 'User', run: () => prisma.user.deleteMany() },
] as const;

/** User-data tables, same order as STEPS. */
const COUNTS = {
  LearnerEvent: () => prisma.learnerEvent.count(),
  ItemReviewState: () => prisma.itemReviewState.count(),
  ConceptMastery: () => prisma.conceptMastery.count(),
  DiagnosticAnswer: () => prisma.diagnosticAnswer.count(),
  DiagnosticAttempt: () => prisma.diagnosticAttempt.count(),
  VocabAttempt: () => prisma.vocabAttempt.count(),
  GrammarAttempt: () => prisma.grammarAttempt.count(),
  ListeningAttempt: () => prisma.listeningAttempt.count(),
  SkillLevel: () => prisma.skillLevel.count(),
  StudentProfile: () => prisma.studentProfile.count(),
  Session: () => prisma.session.count(),
  Account: () => prisma.account.count(),
  VerificationToken: () => prisma.verificationToken.count(),
  User: () => prisma.user.count(),
} satisfies Record<string, () => Promise<number>>;

/** Content tables — counted before and after purely as a preservation check. */
const CONTENT_COUNTS = {
  Concept: () => prisma.concept.count(),
  ConceptEdge: () => prisma.conceptEdge.count(),
  Item: () => prisma.item.count(),
  DiagnosticItem: () => prisma.diagnosticItem.count(),
  SkillTag: () => prisma.skillTag.count(),
  VocabExercise: () => prisma.vocabExercise.count(),
  GrammarExercise: () => prisma.grammarExercise.count(),
  ListeningExercise: () => prisma.listeningExercise.count(),
} satisfies Record<string, () => Promise<number>>;

async function snapshot(
  source: Record<string, () => Promise<number>>,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    Object.entries(source).map(async ([label, fn]) => {
      counts[label] = await fn();
    }),
  );
  return counts;
}

function printCounts(title: string, counts: Record<string, number>): void {
  const width = Math.max(...Object.keys(counts).map((k) => k.length));
  console.log(`\n${title}`);
  for (const [label, n] of Object.entries(counts)) {
    console.log(`  ${label.padEnd(width)}  ${String(n).padStart(7)}`);
  }
}

/** Hostname only — never the full connection string, never the password. */
function targetHost(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('DATABASE_URL is not set. Refusing to run.');
    process.exit(1);
  }
  try {
    return new URL(raw).hostname;
  } catch {
    console.error('DATABASE_URL is not a parseable URL. Refusing to run.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const confirmed = process.argv.includes('--confirm');
  const host = targetHost();

  console.log('\n=== prod-cleanup ===');
  console.log(`Target host: ${host}`);
  if (host.includes('-pooler')) {
    console.log('Warning: this is a POOLED host. Use the direct (non -pooler) URL.');
  }

  const before = await snapshot(COUNTS);
  const contentBefore = await snapshot(CONTENT_COUNTS);
  printCounts('User data to be DELETED (current counts):', before);
  printCounts('Content to be PRESERVED (current counts):', contentBefore);

  if (!confirmed) {
    console.log('\nDRY RUN — nothing was deleted.');
    console.log('Verify the host above against the Neon console, then re-run with --confirm.');
    return;
  }

  console.log('\n--confirm given. Deleting ALL user data...\n');
  for (const step of STEPS) {
    const { count } = await step.run();
    console.log(`  deleted ${String(count).padStart(7)}  ${step.label}`);
  }

  const after = await snapshot(COUNTS);
  const contentAfter = await snapshot(CONTENT_COUNTS);
  printCounts('After (user data):', after);
  printCounts('After (content):', contentAfter);

  const leftover = Object.entries(after).filter(([, n]) => n > 0);
  if (leftover.length > 0) {
    console.error(`\nFAILED: rows remain in ${leftover.map(([k, n]) => `${k}=${n}`).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const lost = Object.entries(contentBefore).filter(([label, n]) => contentAfter[label] !== n);
  if (lost.length > 0) {
    console.error(`\nFAILED: content tables changed: ${lost.map(([k]) => k).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nDone. All user data removed from ${host}; content intact.`);
}

main()
  .catch((err) => {
    console.error('\nprod-cleanup failed:', err instanceof Error ? err.message : err);
    console.error('The script is idempotent — fix the cause and re-run.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
