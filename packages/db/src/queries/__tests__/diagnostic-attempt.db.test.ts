import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import {
  ATTEMPT_IDLE_LIMIT_MS,
  appendAnswer,
  completeAttempt,
  getAttemptState,
  getDiagnosticPool,
  startOrResumeAttempt,
} from '../diagnostic-attempt';
import { getDiagnosticRevealFacts } from '../diagnostic-reveal';

/**
 * Integration tests against a real, migrated Postgres. The guarantees under
 * test live in the database — the CHECK on activeUserId and the two unique
 * indexes — so mocks could not prove them.
 *
 * Runs when DIAG_DB_TEST_URL points at a migrated throwaway database (CI: the
 * job's postgres:16 service). Skipped without it locally; in CI a missing URL
 * fails instead, so the suite can never silently stop running there.
 * Every row it writes hangs off users and items it creates and deletes.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the diagnostic DB tests would be skipped');
}

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ITEM = {
  grammarB1: `test-diag-${RUN}-g-b1`,
  grammarB2: `test-diag-${RUN}-g-b2`,
  vocabB1: `test-diag-${RUN}-v-b1`,
  draft: `test-diag-${RUN}-g-draft`,
} as const;
const HOUR = 60 * 60 * 1000;

describe.skipIf(!url)('diagnostic attempt queries (real Postgres)', () => {
  let db: PrismaClient;
  const userIds: string[] = [];

  async function newUser(): Promise<string> {
    const user = await db.user.create({
      data: { email: `diag-${RUN}-${userIds.length}@test.local`, profile: { create: {} } },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  const answer = (attemptId: string, userId: string, position: number, itemId: string) => ({
    attemptId,
    userId,
    position,
    itemId,
    correct: true,
    dontKnow: false,
    userAnswer: '0',
  });

  beforeAll(async () => {
    db = createPrismaClient(url);
    const content = { source: { stem: 'I ___ here.', choices: ['am', 'is'], correctIndex: 0 } };
    await db.diagnosticItem.createMany({
      data: [
        { id: ITEM.grammarB1, kind: 'GRAMMAR', cefrLevel: 'B1', status: 'PUBLISHED', content },
        { id: ITEM.grammarB2, kind: 'GRAMMAR', cefrLevel: 'B2', status: 'PUBLISHED', content },
        { id: ITEM.vocabB1, kind: 'VOCAB', cefrLevel: 'B1', status: 'PUBLISHED', content },
        { id: ITEM.draft, kind: 'GRAMMAR', cefrLevel: 'B1', status: 'DRAFT', content },
      ],
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Cascades to attempts and answers, which must go before their items.
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.diagnosticItem.deleteMany({ where: { id: { in: Object.values(ITEM) } } });
    await db.$disconnect();
  });

  describe('startOrResumeAttempt', () => {
    it('creates an attempt that holds the one-in-progress slot (activeUserId)', async () => {
      const userId = await newUser();
      const { attemptId, resumed } = await startOrResumeAttempt(db, userId, new Date());
      expect(resumed).toBe(false);
      const row = await db.diagnosticAttempt.findUniqueOrThrow({ where: { id: attemptId } });
      expect(row).toMatchObject({ userId, activeUserId: userId, status: 'IN_PROGRESS' });
    });

    it('a second start resumes the same attempt', async () => {
      const userId = await newUser();
      const now = new Date();
      const first = await startOrResumeAttempt(db, userId, now);
      const second = await startOrResumeAttempt(db, userId, new Date(now.getTime() + HOUR));
      expect(second).toEqual({ attemptId: first.attemptId, resumed: true });
    });

    it('two concurrent starts (two tabs) land on one attempt', async () => {
      const userId = await newUser();
      const now = new Date();
      const [a, b] = await Promise.all([
        startOrResumeAttempt(db, userId, now),
        startOrResumeAttempt(db, userId, now),
      ]);
      expect(a.attemptId).toBe(b.attemptId);
      expect(await db.diagnosticAttempt.count({ where: { userId } })).toBe(1);
    });

    it('abandons an attempt idle for more than 24 h and starts a new one', async () => {
      const userId = await newUser();
      const t0 = new Date('2026-10-01T10:00:00Z');
      const old = await startOrResumeAttempt(db, userId, t0);
      const later = new Date(t0.getTime() + ATTEMPT_IDLE_LIMIT_MS + 1);
      const fresh = await startOrResumeAttempt(db, userId, later);

      expect(fresh.resumed).toBe(false);
      expect(fresh.attemptId).not.toBe(old.attemptId);
      expect(
        await db.diagnosticAttempt.findUniqueOrThrow({ where: { id: old.attemptId } }),
      ).toMatchObject({ status: 'ABANDONED', activeUserId: null });
    });

    it('a recent answer keeps an old attempt alive', async () => {
      const userId = await newUser();
      const now = Date.now();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date(now - 30 * HOUR));
      await appendAnswer(db, answer(attemptId, userId, 0, ITEM.grammarB1)); // answered just now
      expect(await startOrResumeAttempt(db, userId, new Date(now + HOUR))).toEqual({
        attemptId,
        resumed: true,
      });
    });
  });

  describe('appendAnswer', () => {
    it('rejects a foreign, unknown or finished attempt', async () => {
      const owner = await newUser();
      const stranger = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, owner, new Date());

      expect(await appendAnswer(db, answer(attemptId, stranger, 0, ITEM.grammarB1))).toEqual({
        ok: false,
        error: 'NOT_IN_PROGRESS',
      });
      expect(await appendAnswer(db, answer('no-such-attempt', owner, 0, ITEM.grammarB1))).toEqual({
        ok: false,
        error: 'NOT_IN_PROGRESS',
      });

      await completeAttempt(db, { attemptId, userId: owner, assessedLevel: 'B1', now: new Date() });
      expect(await appendAnswer(db, answer(attemptId, owner, 0, ITEM.grammarB1))).toEqual({
        ok: false,
        error: 'NOT_IN_PROGRESS',
      });
      expect(await db.diagnosticAnswer.count({ where: { attemptId } })).toBe(0);
    });

    it('ITEM_NOT_FOUND for an unknown or unpublished question; the level comes from the bank', async () => {
      const userId = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date());
      expect(await appendAnswer(db, answer(attemptId, userId, 0, ITEM.draft))).toEqual({
        ok: false,
        error: 'ITEM_NOT_FOUND',
      });
      expect(await appendAnswer(db, answer(attemptId, userId, 0, 'no-such-item'))).toEqual({
        ok: false,
        error: 'ITEM_NOT_FOUND',
      });
      expect(await db.diagnosticAnswer.count({ where: { attemptId } })).toBe(0);

      await appendAnswer(db, answer(attemptId, userId, 0, ITEM.grammarB2));
      expect((await db.diagnosticAnswer.findFirstOrThrow({ where: { attemptId } })).itemLevel).toBe(
        'B2',
      );
    });

    it('DUPLICATE for a position or an item already answered', async () => {
      const userId = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date());
      expect(await appendAnswer(db, answer(attemptId, userId, 0, ITEM.grammarB1))).toEqual({
        ok: true,
      });

      // Same position, another item (a double submit).
      expect(await appendAnswer(db, answer(attemptId, userId, 0, ITEM.grammarB2))).toEqual({
        ok: false,
        error: 'DUPLICATE',
      });
      // Same item, next position (a repeated question).
      expect(await appendAnswer(db, answer(attemptId, userId, 1, ITEM.grammarB1))).toEqual({
        ok: false,
        error: 'DUPLICATE',
      });
      expect(await db.diagnosticAnswer.count({ where: { attemptId } })).toBe(1);
    });
  });

  describe('completeAttempt', () => {
    it('only one of two completions wins; the level lands on attempt and profile', async () => {
      const userId = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date());
      const now = new Date();
      const results = await Promise.all([
        completeAttempt(db, { attemptId, userId, assessedLevel: 'B2', now }),
        completeAttempt(db, { attemptId, userId, assessedLevel: 'B2', now }),
      ]);
      expect(results.filter((r) => r.won)).toHaveLength(1);
      expect(await completeAttempt(db, { attemptId, userId, assessedLevel: 'B2', now })).toEqual({
        won: false,
      });

      expect(
        await db.diagnosticAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
      ).toMatchObject({ status: 'COMPLETED', activeUserId: null, assessedLevel: 'B2' });
      expect((await db.studentProfile.findUniqueOrThrow({ where: { userId } })).assessedLevel).toBe(
        'B2',
      );
    });

    it('frees the slot: the next start is a new attempt', async () => {
      const userId = await newUser();
      const first = await startOrResumeAttempt(db, userId, new Date());
      await completeAttempt(db, {
        attemptId: first.attemptId,
        userId,
        assessedLevel: 'B1',
        now: new Date(),
      });
      const next = await startOrResumeAttempt(db, userId, new Date());
      expect(next.resumed).toBe(false);
      expect(next.attemptId).not.toBe(first.attemptId);
    });
  });

  describe('database constraints', () => {
    it('CHECK rejects activeUserId on a COMPLETED attempt', async () => {
      const userId = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date());
      await expect(
        db.diagnosticAttempt.update({ where: { id: attemptId }, data: { status: 'COMPLETED' } }),
      ).rejects.toThrow(/DiagnosticAttempt_activeUserId_in_progress/);
    });

    it('CHECK rejects activeUserId pointing at another user', async () => {
      const userId = await newUser();
      const other = await newUser();
      await expect(
        db.diagnosticAttempt.create({ data: { userId, activeUserId: other } }),
      ).rejects.toThrow(/DiagnosticAttempt_activeUserId_in_progress/);
    });
  });

  describe('reads', () => {
    it('attempt state: answers in position order with axis and level; foreign = null', async () => {
      const userId = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date());
      await appendAnswer(db, {
        ...answer(attemptId, userId, 1, ITEM.vocabB1),
        correct: false,
        dontKnow: true,
        userAnswer: '',
      });
      await appendAnswer(db, { ...answer(attemptId, userId, 0, ITEM.grammarB2) });

      expect(await getAttemptState(db, attemptId, userId)).toEqual({
        attemptId,
        status: 'IN_PROGRESS',
        answers: [
          {
            position: 0,
            itemId: ITEM.grammarB2,
            axis: 'GRAMMAR',
            itemLevel: 'B2',
            correct: true,
            dontKnow: false,
          },
          {
            position: 1,
            itemId: ITEM.vocabB1,
            axis: 'VOCAB',
            itemLevel: 'B1',
            correct: false,
            dontKnow: true,
          },
        ],
      });
      expect(await getAttemptState(db, attemptId, await newUser())).toBeNull();
    });

    it('pool: PUBLISHED questions only, without content', async () => {
      const pool = (await getDiagnosticPool(db)).filter((p) => p.id.includes(RUN));
      expect(pool).toEqual([
        { id: ITEM.grammarB1, kind: 'GRAMMAR', cefrLevel: 'B1' },
        { id: ITEM.grammarB2, kind: 'GRAMMAR', cefrLevel: 'B2' },
        { id: ITEM.vocabB1, kind: 'VOCAB', cefrLevel: 'B1' },
      ]);
    });

    it('reveal facts carry position and item level', async () => {
      const userId = await newUser();
      const { attemptId } = await startOrResumeAttempt(db, userId, new Date());
      await appendAnswer(db, { ...answer(attemptId, userId, 0, ITEM.grammarB2) });
      await completeAttempt(db, { attemptId, userId, assessedLevel: 'B2', now: new Date() });

      const facts = await getDiagnosticRevealFacts(db, { userId, attemptId });
      expect(facts?.answers).toEqual([
        {
          position: 0,
          axis: 'GRAMMAR',
          itemLevel: 'B2',
          correct: true,
          dontKnow: false,
          skillTag: null,
        },
      ]);
    });
  });
});
