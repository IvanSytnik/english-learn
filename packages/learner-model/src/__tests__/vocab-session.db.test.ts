import { createPrismaClient } from '@englishlearn/db/create-client';
import type { PrismaClient } from '@englishlearn/db/generated/client/client.js';
import { countNewVocabWordsSince } from '@englishlearn/db/queries/vocab-session';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createLearnerService } from '../service/learner-service';
import {
  clearStaticGraphCache,
  createPrismaLearnerDb,
  createPrismaVocabSessionDb,
} from '../service/prisma-db';
import { createVocabSessionService } from '../service/vocab-session-service';

/**
 * The daily new-word limit on real Postgres (B2.5): countNewVocabWordsSince
 * counts vocabulary words whose first attempt falls in the learner's local
 * day — once per word, never a passed proof, never a grammar item, never a
 * word first met yesterday — and nextVocab stops introducing new words at
 * dailyVocabLimit while reviews keep coming. Outcomes are written through
 * recordVocabOutcome, the one write path. Same gate as the other DB tests
 * (DIAG_DB_TEST_URL; required in CI). Rows carry this run's tag.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the vocab session DB test would be skipped');
}

const RUN = `test-vsession-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.vocab`;
const GRAMMAR = `${RUN}.grammar`;
const TZ = 'Europe/Berlin';
// 2026-10-29 14:00 in Berlin (CET, UTC+1); the local day began 2026-10-28T23:00Z.
const NOW = Date.parse('2026-10-29T13:00:00Z');
const DAY_START = Date.parse('2026-10-28T23:00:00Z');
const MIN = 60_000;

describe.skipIf(!url)('vocabulary daily limit (real Postgres)', () => {
  let prisma: PrismaClient;
  const words: string[] = [];
  let grammarItem = '';
  let unpublishedItem = '';
  let userId = '';

  const learner = () => createLearnerService(createPrismaLearnerDb(prisma));
  const session = () => createVocabSessionService(createPrismaVocabSessionDb(prisma));
  const answer = (
    itemId: string,
    atMs: number,
    extra: { proof?: boolean; correct?: boolean } = {},
  ) =>
    learner().recordVocabOutcome({
      userId,
      itemId,
      correct: extra.correct ?? true,
      mode: extra.proof ? 'recall' : 'recognition',
      proof: extra.proof,
      occurredAtMs: BigInt(atMs),
    });
  const newToday = () => countNewVocabWordsSince(prisma, { userId, sinceMs: DAY_START });

  beforeAll(async () => {
    prisma = createPrismaClient(url);
    await prisma.concept.createMany({
      data: [
        { id: CONCEPT, name: 'vocab', cefrLevel: 'A1', category: 'VOCAB' },
        { id: GRAMMAR, name: 'grammar', cefrLevel: 'A1', category: 'GRAMMAR' },
      ],
    });
    for (let i = 0; i < 7; i++) {
      const lemma = `${RUN}-w${i}`;
      const lexeme = await prisma.lexeme.create({
        data: {
          lemma,
          lemmaKey: lemma,
          pos: 'NOUN',
          cefrLevel: 'A1',
          cefrJLevel: 'A1',
          definitions: { en: 'x' },
          translations: { ru: 'x' },
          // The last word is back in REVIEW: its item must never be served.
          status: i === 6 ? 'REVIEW' : 'PUBLISHED',
        },
      });
      const item = await prisma.item.create({
        data: {
          conceptId: CONCEPT,
          kind: 'VOCAB_WORD',
          cefrLevel: 'A1',
          status: 'PUBLISHED',
          content: { headword: lemma, variants: [] },
          lexemeId: lexeme.id,
        },
      });
      if (i === 6) unpublishedItem = item.id;
      else words.push(item.id);
    }
    grammarItem = (
      await prisma.item.create({
        data: {
          conceptId: GRAMMAR,
          kind: 'GRAMMAR_PATTERN',
          cefrLevel: 'A1',
          status: 'PUBLISHED',
          content: { source: {}, practice: { type: 'choice' } },
          hasPractice: true,
        },
      })
    ).id;
  });

  beforeEach(async () => {
    clearStaticGraphCache();
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    userId = (
      await prisma.user.create({
        data: { email: `${RUN}@test.dev`, profile: { create: { dailyVocabLimit: 2 } } },
      })
    ).id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.concept.deleteMany({ where: { id: { in: [CONCEPT, GRAMMAR] } } });
    await prisma.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await prisma.$disconnect();
  });

  it('counts each word first met today once, whatever the attempts', async () => {
    const [w0, w1] = words as [string, string];
    await answer(w0, DAY_START + MIN, { correct: false });
    await answer(w0, DAY_START + 2 * MIN);
    await answer(w1, DAY_START + 3 * MIN);
    await answer(w0, DAY_START + 4 * MIN);
    expect(await newToday()).toBe(2);
  });

  it('leaves out a word first met yesterday (local midnight), even if answered today', async () => {
    const [w0, w1] = words as [string, string];
    await answer(w0, DAY_START - 1);
    await answer(w1, DAY_START);
    await answer(w0, DAY_START + MIN);
    expect(await newToday()).toBe(1);
  });

  it('leaves out a passed proof; a failed proof counts', async () => {
    const [w0, w1] = words as [string, string];
    await answer(w0, DAY_START + MIN, { proof: true });
    await answer(w1, DAY_START + 2 * MIN, { proof: true, correct: false });
    const events = await prisma.learnerEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(events.map((e) => (e.payload as { proof?: true }).proof ?? null)).toEqual([true, null]);
    expect(await newToday()).toBe(1);
  });

  it('never counts grammar answers', async () => {
    await learner().recordOutcome({
      userId,
      itemId: grammarItem,
      correct: true,
      occurredAtMs: BigInt(DAY_START + MIN),
    });
    expect(await newToday()).toBe(0);
  });

  it('nextVocab stops new words at the limit and keeps serving reviews', async () => {
    const svc = session();
    await expect(svc.nextVocab({ userId, timeZone: TZ, nowMs: NOW })).resolves.toMatchObject({
      ok: true,
      reason: 'NEW',
      remainingNew: 2,
    });
    // Two words met today (limit 2), and a third proven — no new word left.
    const [w0, w1, w2] = words as [string, string, string];
    await answer(w0, NOW - 30 * MIN);
    await answer(w1, NOW - 20 * MIN);
    await answer(w2, NOW - 10 * MIN, { proof: true });
    const out = await svc.nextVocab({ userId, timeZone: TZ, nowMs: NOW });
    // w0/w1 are in learning with short steps due by now; no NEW is offered.
    expect(out).toMatchObject({ ok: true, reason: 'LEARNING', remainingNew: 0 });
    if (!out.ok) throw new Error('expected a word');
    expect([w0, w1]).toContain(out.itemId);

    // Past every due moment the reviews come before anything new.
    const later = await svc.nextVocab({ userId, timeZone: TZ, nowMs: NOW + 9 * 86_400_000 });
    expect(later).toMatchObject({ ok: true, reason: 'REVIEW_DUE' });
  });

  it('a topic session serves only its concept; the choice carries lastReviewAt', async () => {
    const [w0] = words as [string];
    await answer(w0, NOW - 30 * MIN);
    const recorded = await prisma.itemReviewState.findUniqueOrThrow({
      where: { userId_itemId: { userId, itemId: w0 } },
      select: { lastReviewAt: true },
    });
    const out = await session().nextVocab({ userId, timeZone: TZ, nowMs: NOW, conceptId: CONCEPT });
    expect(out).toMatchObject({ ok: true, reason: 'LEARNING', itemId: w0 });
    if (!out.ok) throw new Error('expected a word');
    expect(out.lastReviewAt).toBe(recorded.lastReviewAt);

    const fresh = await session().nextVocab({
      userId,
      timeZone: TZ,
      nowMs: NOW,
      conceptId: CONCEPT,
      excludeItemIds: [w0],
    });
    expect(fresh).toMatchObject({ ok: true, reason: 'NEW', lastReviewAt: null });
    if (!fresh.ok) throw new Error('expected a word');
    expect(words).toContain(fresh.itemId);

    await expect(
      session().nextVocab({ userId, timeZone: TZ, nowMs: NOW, conceptId: GRAMMAR }),
    ).resolves.toMatchObject({ ok: false, reason: 'NOTHING_DUE', nextDueAt: null });
  });

  it('offers only published lexeme-backed items, never grammar', async () => {
    const ids = new Set(
      (await createPrismaVocabSessionDb(prisma).getVocabCandidates(userId)).map((c) => c.itemId),
    );
    for (const w of words) expect(ids.has(w)).toBe(true);
    const rows = await createPrismaVocabSessionDb(prisma).getVocabCandidates(userId);
    for (const r of rows.filter((c) => words.includes(c.itemId))) {
      expect(r.conceptId).toBe(CONCEPT);
    }
    expect(ids.has(unpublishedItem)).toBe(false);
    expect(ids.has(grammarItem)).toBe(false);
  });

  it('a new local day restores the allowance', async () => {
    const [w0, w1] = words as [string, string];
    await answer(w0, NOW - 30 * MIN);
    await answer(w1, NOW - 20 * MIN);
    const tomorrow = Date.parse('2026-10-29T23:30:00Z'); // 00:30 in Berlin
    const out = await session().nextVocab({ userId, timeZone: TZ, nowMs: tomorrow });
    expect(out).toMatchObject({ remainingNew: 2 });
    // The same instant in UTC is still the 29th: the allowance is used up.
    const utc = await session().nextVocab({ userId, timeZone: 'UTC', nowMs: tomorrow });
    expect(utc).toMatchObject({ remainingNew: 0 });
  });
});
