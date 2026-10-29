import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { getUserExportData } from '../user-export';

/**
 * Integration tests against a real, migrated Postgres (DIAG_DB_TEST_URL, as in
 * diagnostic-attempt.db.test.ts): the export is one nested select, and only a
 * real database shows that it returns this user's rows — all of them, nobody
 * else's — and that a stored password hash never comes back.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the user export DB tests would be skipped');
}

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ITEM = `test-export-${RUN}-g-b1`;
const HASH = '$2b$10$4QIKH6DGwwh048z8q8ARUOzDTmPgnatnXjQj0uMQqj52YwCTmEDci';
const OCCURRED = [1_790_000_000_000n, 1_780_000_000_000n];

describe.skipIf(!url)('user data export (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  async function newUser(): Promise<string> {
    const user = await db.user.create({
      data: {
        email: `export-${RUN}-${userIds.length}@test.local`,
        name: 'Ada',
        passwordHash: HASH,
        signupSource: 'newsletter',
        profile: { create: { nativeLanguage: 'uk', assessedLevel: 'B1' } },
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  /** One finished attempt with an answer, two events (stored out of order), one report. */
  async function seed(userId: string): Promise<void> {
    await db.diagnosticAttempt.create({
      data: {
        userId,
        status: 'COMPLETED',
        completedAt: new Date(),
        assessedLevel: 'B1',
        answers: {
          create: {
            itemId: ITEM,
            userAnswer: 'am',
            isCorrect: true,
            itemLevel: 'B1',
            position: 0,
            timeMs: 4200,
          },
        },
      },
    });
    for (const occurredAt of OCCURRED) {
      await db.learnerEvent.create({
        data: {
          userId,
          type: 'ITEM_ATTEMPTED',
          occurredAt,
          payload: { itemId: 'i', correct: true },
        },
      });
    }
    await db.betaFeedback.create({
      data: { userId, text: 'Typo in the stem', url: '/en/exercises' },
    });
  }

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.diagnosticItem.create({
      data: {
        id: ITEM,
        kind: 'GRAMMAR',
        cefrLevel: 'B1',
        status: 'PUBLISHED',
        content: { source: { stem: 'I ___ here.', choices: ['am', 'is'], correctIndex: 0 } },
      },
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.diagnosticItem.deleteMany({ where: { id: ITEM } });
    await db.$disconnect();
  });

  it('exports the profile, diagnostic answers, events and feedback — never the password hash', async () => {
    const userId = await newUser();
    await seed(userId);

    const payload = await getUserExportData(db, userId);

    expect(payload).not.toBeNull();
    // biome-ignore lint/suspicious/noExplicitAny: proving a key is absent, not typing it.
    expect((payload as any).user.passwordHash).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain(HASH);
    expect(payload?.user).toMatchObject({ id: userId, name: 'Ada', signupSource: 'newsletter' });
    expect(payload?.studentProfile).toMatchObject({ nativeLanguage: 'uk', assessedLevel: 'B1' });
    expect(payload?.diagnosticAttempts).toHaveLength(1);
    expect(payload?.diagnosticAttempts[0]?.answers).toEqual([
      expect.objectContaining({ itemId: ITEM, userAnswer: 'am', isCorrect: true, itemLevel: 'B1' }),
    ]);
    expect(payload?.betaFeedbacks).toEqual([
      expect.objectContaining({ text: 'Typo in the stem', url: '/en/exercises' }),
    ]);
    expect(payload?.conceptMastery).toEqual([]);
    expect(payload?.itemReviewStates).toEqual([]);
  });

  it('orders events by occurredAt and turns the BigInt timestamps into ISO strings', async () => {
    const userId = await newUser();
    await seed(userId);

    const payload = await getUserExportData(db, userId);

    expect(payload?.learnerEvents.map((e) => e.occurredAt)).toEqual(
      [...OCCURRED].sort().map((ms) => new Date(Number(ms)).toISOString()),
    );
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  it('leaves the verdict and level out of answers in an attempt still in progress', async () => {
    const userId = await newUser();
    await db.diagnosticAttempt.create({
      data: {
        userId,
        activeUserId: userId,
        answers: {
          create: {
            itemId: ITEM,
            userAnswer: 'is',
            isCorrect: false,
            itemLevel: 'B1',
            position: 0,
          },
        },
      },
    });

    const [answer] = (await getUserExportData(db, userId))?.diagnosticAttempts[0]?.answers ?? [];

    expect(answer).toMatchObject({ itemId: ITEM, userAnswer: 'is' });
    expect(answer).not.toHaveProperty('isCorrect');
    expect(answer).not.toHaveProperty('itemLevel');
  });

  it("contains only the requested user's rows", async () => {
    const userId = await newUser();
    const other = await newUser();
    await seed(other);

    const payload = await getUserExportData(db, userId);

    expect(payload?.user.id).toBe(userId);
    expect(payload?.learnerEvents).toEqual([]);
    expect(payload?.diagnosticAttempts).toEqual([]);
    expect(payload?.betaFeedbacks).toEqual([]);
  });

  it('returns null for an unknown user', async () => {
    expect(await getUserExportData(db, `missing-${RUN}`)).toBeNull();
  });
});
