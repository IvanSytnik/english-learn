import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { MAX_ACTIVE_WORD_LISTS, MAX_WORD_LIST_ENTRIES } from '../../schemas/word-list';
import {
  clearLexemePreferences,
  getVocabPreferences,
  setLexemePreferences,
} from '../lexeme-preferences';
import {
  addWordListEntries,
  archiveWordList,
  createWordList,
  getWordList,
  getWordListItemIds,
  listWordLists,
  moveWordListEntry,
  removeWordListEntry,
  renameWordList,
  reorderWordListEntries,
  restoreWordList,
  setWordListEntryNote,
} from '../word-lists';

/**
 * Word preferences and word lists on real Postgres (B6.6): one preference row
 * per user and word, PUBLISHED-only writes, owner checks that answer
 * NOT_FOUND for another user's list, the 50-list and 500-entry limits at
 * their boundary, and the migration's CHECKs as the last line.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the word lists DB test would be skipped');
}

const RUN = `test-wl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.vocab`;

describe.skipIf(!url)('word preferences and word lists (real Postgres)', () => {
  let db: PrismaClient;
  let users = 0;
  /** PUBLISHED lexemes with a PUBLISHED item, in creation order. */
  const published: { lexemeId: string; itemId: string }[] = [];
  let draftLexemeId = '';

  const newUser = async () =>
    (await db.user.create({ data: { email: `${RUN}-${users++}@test.dev` } })).id;

  beforeAll(async () => {
    db = createPrismaClient(url);
    await db.concept.create({
      data: { id: CONCEPT, name: 'vocab', cefrLevel: 'A2', category: 'VOCAB' },
    });
    const lexeme = (i: number, status: 'PUBLISHED' | 'DRAFT') => ({
      lemma: `${RUN}-${status}-${i}`,
      lemmaKey: `${RUN}-${status.toLowerCase()}-${i}`,
      pos: 'NOUN' as const,
      cefrLevel: 'A2' as const,
      cefrJLevel: 'A2',
      definitions: { en: `def ${i}` },
      translations: { ru: `ru ${i}` },
      status,
    });
    // 501 published words: enough for the 500-entry boundary.
    await db.lexeme.createMany({
      data: Array.from({ length: MAX_WORD_LIST_ENTRIES + 1 }, (_, i) => lexeme(i, 'PUBLISHED')),
    });
    const rows = await db.lexeme.findMany({
      where: { lemmaKey: { startsWith: `${RUN}-published-` } },
      select: { id: true, lemmaKey: true },
    });
    rows.sort((a, b) => Number(a.lemmaKey.split('-').pop()) - Number(b.lemmaKey.split('-').pop()));
    await db.item.createMany({
      data: rows.map((r) => ({
        conceptId: CONCEPT,
        kind: 'VOCAB_WORD' as const,
        cefrLevel: 'A2' as const,
        status: 'PUBLISHED' as const,
        content: { headword: r.lemmaKey, variants: [] },
        lexemeId: r.id,
      })),
    });
    const items = await db.item.findMany({
      where: { conceptId: CONCEPT },
      select: { id: true, lexemeId: true },
    });
    const itemOf = new Map(items.map((i) => [i.lexemeId, i.id]));
    for (const r of rows) published.push({ lexemeId: r.id, itemId: itemOf.get(r.id) as string });
    draftLexemeId = (await db.lexeme.create({ data: lexeme(0, 'DRAFT') })).id;
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    await db.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await db.item.deleteMany({ where: { conceptId: CONCEPT } });
    await db.concept.deleteMany({ where: { id: CONCEPT } });
    await db.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await db.$disconnect();
  });

  const lx = (i: number) => (published[i] as { lexemeId: string }).lexemeId;

  describe('preferences', () => {
    it('one row per user and word: prioritize replaces hidden and back; repeats change nothing', async () => {
      const userId = await newUser();
      const ids = [lx(0), lx(1)];
      expect(await setLexemePreferences(db, { userId, lexemeIds: ids, state: 'HIDDEN' })).toEqual({
        changed: 2,
        notFound: [],
      });
      // Idempotent: the same state again writes nothing.
      expect(
        (await setLexemePreferences(db, { userId, lexemeIds: ids, state: 'HIDDEN' })).changed,
      ).toBe(0);
      expect(
        (await setLexemePreferences(db, { userId, lexemeIds: [lx(0)], state: 'PRIORITIZED' }))
          .changed,
      ).toBe(1);
      const rows = await db.studentLexemePreference.findMany({ where: { userId } });
      expect(rows).toHaveLength(2);
      expect(Object.fromEntries(rows.map((r) => [r.lexemeId, r.state]))).toEqual({
        [lx(0)]: 'PRIORITIZED',
        [lx(1)]: 'HIDDEN',
      });
    });

    it('a non-PUBLISHED or unknown lexeme is NOT_FOUND and never written', async () => {
      const userId = await newUser();
      const result = await setLexemePreferences(db, {
        userId,
        lexemeIds: [lx(2), draftLexemeId, 'no-such-lexeme'],
        state: 'PRIORITIZED',
      });
      expect(result).toEqual({ changed: 1, notFound: [draftLexemeId, 'no-such-lexeme'] });
      expect(await db.studentLexemePreference.count({ where: { userId } })).toBe(1);
    });

    it('unprioritize leaves a hidden word hidden; unhide removes the row', async () => {
      const userId = await newUser();
      await setLexemePreferences(db, { userId, lexemeIds: [lx(3)], state: 'HIDDEN' });
      expect(
        await clearLexemePreferences(db, { userId, lexemeIds: [lx(3)], state: 'PRIORITIZED' }),
      ).toEqual({ cleared: 0 });
      expect(
        await clearLexemePreferences(db, { userId, lexemeIds: [lx(3)], state: 'HIDDEN' }),
      ).toEqual({ cleared: 1 });
      expect(await db.studentLexemePreference.count({ where: { userId } })).toBe(0);
    });

    it('getVocabPreferences: each row with its word’s item, only this user’s', async () => {
      const userId = await newUser();
      const other = await newUser();
      await setLexemePreferences(db, { userId, lexemeIds: [lx(4)], state: 'PRIORITIZED' });
      await setLexemePreferences(db, { userId, lexemeIds: [lx(5)], state: 'HIDDEN' });
      await setLexemePreferences(db, { userId: other, lexemeIds: [lx(6)], state: 'HIDDEN' });
      const rows = await getVocabPreferences(db, userId);
      expect(rows).toEqual(
        expect.arrayContaining([
          { lexemeId: lx(4), itemId: published[4]?.itemId, state: 'PRIORITIZED' },
          { lexemeId: lx(5), itemId: published[5]?.itemId, state: 'HIDDEN' },
        ]),
      );
      expect(rows).toHaveLength(2);
    });

    it('cascades with the user', async () => {
      const userId = await newUser();
      await setLexemePreferences(db, { userId, lexemeIds: [lx(7)], state: 'HIDDEN' });
      await db.user.delete({ where: { id: userId } });
      expect(await db.studentLexemePreference.count({ where: { userId } })).toBe(0);
    });
  });

  describe('lists', () => {
    it('create, rename, add, note, reorder, remove, archive — the owner only', async () => {
      const ownerId = await newUser();
      const created = await createWordList(db, { ownerId, title: '  Trip  ' });
      if (!created.ok) throw new Error(created.error);
      const listId = created.value.id;
      expect(created.value.title).toBe('Trip');
      expect(await renameWordList(db, { ownerId, listId, title: 'Trip to Rome' })).toEqual({
        ok: true,
        value: { title: 'Trip to Rome' },
      });
      expect(
        await addWordListEntries(db, {
          ownerId,
          listId,
          lexemeIds: [lx(0), lx(1), draftLexemeId, lx(0)],
        }),
      ).toEqual({
        ok: true,
        value: { added: 2, alreadyIn: 0, notFound: [draftLexemeId], didNotFit: 0 },
      });
      expect(
        (await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(1), lx(2)] })).ok,
      ).toBe(true);
      expect(
        await setWordListEntryNote(db, { ownerId, listId, lexemeId: lx(1), note: ' the city ' }),
      ).toEqual({ ok: true, value: { note: 'the city' } });
      expect(
        await reorderWordListEntries(db, { ownerId, listId, lexemeIds: [lx(2), lx(0), lx(1)] }),
      ).toEqual({ ok: true, value: { count: 3 } });
      expect(await removeWordListEntry(db, { ownerId, listId, lexemeId: lx(0) })).toEqual({
        ok: true,
        value: { removed: true },
      });
      const view = await getWordList(db, { ownerId, listId });
      if (!view.ok) throw new Error(view.error);
      expect(view.value.title).toBe('Trip to Rome');
      expect(view.value.entries.map((e) => [e.lexemeId, e.note])).toEqual([
        [lx(2), null],
        [lx(1), 'the city'],
      ]);
      expect(await getWordListItemIds(db, { ownerId, listId })).toEqual(
        expect.arrayContaining([published[1]?.itemId, published[2]?.itemId]),
      );
      expect(await archiveWordList(db, { ownerId, listId })).toEqual({
        ok: true,
        value: { archived: true, changed: true },
      });
      // Archived: read-only, gone from sessions, a repeated archive is a no-op.
      expect(await archiveWordList(db, { ownerId, listId })).toMatchObject({ ok: true });
      expect(await renameWordList(db, { ownerId, listId, title: 'x' })).toEqual({
        ok: false,
        error: 'NOT_FOUND',
      });
      expect(await getWordListItemIds(db, { ownerId, listId })).toBeNull();
    });

    it('another user’s list is NOT_FOUND for every call, never FORBIDDEN', async () => {
      const ownerId = await newUser();
      const intruder = await newUser();
      const created = await createWordList(db, { ownerId, title: 'Mine' });
      if (!created.ok) throw new Error(created.error);
      const listId = created.value.id;
      await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(0), lx(1)] });
      const as = { ownerId: intruder, listId };
      const NF = { ok: false, error: 'NOT_FOUND' };
      expect(await renameWordList(db, { ...as, title: 'Stolen' })).toEqual(NF);
      expect(await archiveWordList(db, as)).toEqual(NF);
      expect(await addWordListEntries(db, { ...as, lexemeIds: [lx(2)] })).toEqual(NF);
      expect(await removeWordListEntry(db, { ...as, lexemeId: lx(0) })).toEqual(NF);
      expect(await reorderWordListEntries(db, { ...as, lexemeIds: [lx(1), lx(0)] })).toEqual(NF);
      expect(await setWordListEntryNote(db, { ...as, lexemeId: lx(0), note: 'x' })).toEqual(NF);
      expect(
        await moveWordListEntry(db, { ...as, lexemeId: lx(1), anchor: { before: lx(0) } }),
      ).toEqual(NF);
      expect(await restoreWordList(db, as)).toEqual(NF);
      expect(await getWordList(db, as)).toEqual(NF);
      expect((await listWordLists(db, intruder)).map((l) => l.id)).not.toContain(listId);
      expect(await getWordListItemIds(db, as)).toBeNull();
      // Nothing changed for the owner.
      const view = await getWordList(db, { ownerId, listId });
      expect(view.ok && view.value.entries.map((e) => e.lexemeId)).toEqual([lx(0), lx(1)]);
      expect(view.ok && view.value.title).toBe('Mine');
    });

    it('50 active lists per owner: the 51st is LIMIT; archiving one frees a place', async () => {
      const ownerId = await newUser();
      await db.wordList.createMany({
        data: Array.from({ length: MAX_ACTIVE_WORD_LISTS - 1 }, (_, i) => ({
          ownerId,
          title: `L${i}`,
          source: 'CUSTOM' as const,
        })),
      });
      const fiftieth = await createWordList(db, { ownerId, title: 'L49' });
      expect(fiftieth.ok).toBe(true);
      expect(await createWordList(db, { ownerId, title: 'L50' })).toEqual({
        ok: false,
        error: 'LIMIT',
      });
      if (!fiftieth.ok) return;
      await archiveWordList(db, { ownerId, listId: fiftieth.value.id });
      expect((await createWordList(db, { ownerId, title: 'L50' })).ok).toBe(true);
      expect(await db.wordList.count({ where: { ownerId, archivedAt: null } })).toBe(50);
    });

    it('eight concurrent creates at 49 lists: exactly one wins (the owner row lock)', async () => {
      const ownerId = await newUser();
      await db.wordList.createMany({
        data: Array.from({ length: MAX_ACTIVE_WORD_LISTS - 1 }, (_, i) => ({
          ownerId,
          title: `L${i}`,
          source: 'CUSTOM' as const,
        })),
      });
      // Open eight pooled connections first: otherwise the first create
      // commits while the others are still connecting, and no race happens.
      await Promise.all(
        Array.from({ length: 8 }, () => db.$queryRaw`SELECT pg_sleep(0.05)::text AS warm`),
      );
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => createWordList(db, { ownerId, title: `C${i}` })),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.wordList.count({ where: { ownerId, archivedAt: null } })).toBe(50);
    });

    it('500 entries per list: 500 fit, the 501st is LIMIT and adds nothing', async () => {
      const ownerId = await newUser();
      const created = await createWordList(db, { ownerId, title: 'Big' });
      if (!created.ok) throw new Error(created.error);
      const listId = created.value.id;
      const first499 = published.slice(0, MAX_WORD_LIST_ENTRIES - 1).map((p) => p.lexemeId);
      expect(await addWordListEntries(db, { ownerId, listId, lexemeIds: first499 })).toMatchObject({
        ok: true,
        value: { added: 499 },
      });
      // 499 + 2 = 501: refused as a whole.
      expect(
        await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(499), lx(500)] }),
      ).toEqual({ ok: false, error: 'LIMIT' });
      expect(await db.wordListEntry.count({ where: { listId } })).toBe(499);
      expect(await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(499)] })).toMatchObject(
        { ok: true, value: { added: 1 } },
      );
      expect(await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(500)] })).toEqual({
        ok: false,
        error: 'LIMIT',
      });
      // A word already in the full list is not a new entry.
      expect(await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(0)] })).toMatchObject({
        ok: true,
        value: { added: 0, alreadyIn: 1 },
      });
      expect(await db.wordListEntry.count({ where: { listId } })).toBe(500);
    }, 30_000);

    it('concurrent adds at 499 entries: exactly one word gets the last place (the list row lock)', async () => {
      const ownerId = await newUser();
      const created = await createWordList(db, { ownerId, title: 'Race' });
      if (!created.ok) throw new Error(created.error);
      const listId = created.value.id;
      await addWordListEntries(db, {
        ownerId,
        listId,
        lexemeIds: published.slice(0, MAX_WORD_LIST_ENTRIES - 1).map((p) => p.lexemeId),
      });
      await Promise.all(
        Array.from({ length: 2 }, () => db.$queryRaw`SELECT pg_sleep(0.05)::text AS warm`),
      );
      const results = await Promise.all(
        [lx(499), lx(500)].map((id) =>
          addWordListEntries(db, { ownerId, listId, lexemeIds: [id] }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await db.wordListEntry.count({ where: { listId } })).toBe(MAX_WORD_LIST_ENTRIES);
    }, 30_000);

    it('B6.7 restore: an archived list comes back; at 50 active lists it is LIMIT', async () => {
      const ownerId = await newUser();
      const made = await createWordList(db, { ownerId, title: 'Old' });
      if (!made.ok) throw new Error(made.error);
      const listId = made.value.id;
      await archiveWordList(db, { ownerId, listId });
      await db.wordList.createMany({
        data: Array.from({ length: MAX_ACTIVE_WORD_LISTS }, (_, i) => ({
          ownerId,
          title: `L${i}`,
          source: 'CUSTOM' as const,
        })),
      });
      expect(await restoreWordList(db, { ownerId, listId })).toEqual({ ok: false, error: 'LIMIT' });
      const one = await db.wordList.findFirstOrThrow({ where: { ownerId, title: 'L0' } });
      await archiveWordList(db, { ownerId, listId: one.id });
      expect(await restoreWordList(db, { ownerId, listId })).toEqual({
        ok: true,
        value: { restored: true, changed: true },
      });
      // Restoring an active list is a no-op.
      expect(await restoreWordList(db, { ownerId, listId })).toEqual({
        ok: true,
        value: { restored: true, changed: false },
      });
      expect(await db.wordList.count({ where: { ownerId, archivedAt: null } })).toBe(50);
    });

    it('B6.7 index: active lists by last change, then archived; words in list order', async () => {
      const ownerId = await newUser();
      const ids: string[] = [];
      for (const title of ['A', 'B', 'C']) {
        const made = await createWordList(db, { ownerId, title });
        if (!made.ok) throw new Error(made.error);
        ids.push(made.value.id);
      }
      const [a, b, c] = ids as [string, string, string];
      await addWordListEntries(db, { ownerId, listId: a, lexemeIds: [lx(2), lx(0)] });
      await archiveWordList(db, { ownerId, listId: b });
      const lists = await listWordLists(db, ownerId);
      expect(lists.map((l) => [l.title, l.archivedAt === null])).toEqual([
        ['A', true],
        ['C', true],
        ['B', false],
      ]);
      expect(lists[0]?.lexemeIds).toEqual([lx(2), lx(0)]);
      // A note changes the list's "updated" date: C was last touched before it.
      await new Promise((r) => setTimeout(r, 5));
      await addWordListEntries(db, { ownerId, listId: c, lexemeIds: [lx(1)] });
      await new Promise((r) => setTimeout(r, 5));
      await setWordListEntryNote(db, { ownerId, listId: a, lexemeId: lx(0), note: 'n' });
      expect((await listWordLists(db, ownerId)).map((l) => l.title)).toEqual(['A', 'C', 'B']);
    });

    it('B6.7 move: before / after another word, positions 0..n-1, only changed rows written', async () => {
      const ownerId = await newUser();
      const made = await createWordList(db, { ownerId, title: 'M' });
      if (!made.ok) throw new Error(made.error);
      const listId = made.value.id;
      const words = [lx(0), lx(1), lx(2), lx(3), lx(4)];
      await addWordListEntries(db, { ownerId, listId, lexemeIds: words });
      const order = async () => {
        const view = await getWordList(db, { ownerId, listId });
        if (!view.ok) throw new Error(view.error);
        return view.value.entries.map((e) => [e.lexemeId, e.position]);
      };
      const move = (lexemeId: string, anchor: { before: string } | { after: string }) =>
        moveWordListEntry(db, { ownerId, listId, lexemeId, anchor });
      // Keyboard "up" on the 4th word: before the 3rd.
      expect(await move(lx(3), { before: lx(2) })).toEqual({ ok: true, value: { moved: true } });
      expect(await order()).toEqual([
        [lx(0), 0],
        [lx(1), 1],
        [lx(3), 2],
        [lx(2), 3],
        [lx(4), 4],
      ]);
      // Drag the first word to the end.
      expect(await move(lx(0), { after: lx(4) })).toMatchObject({ ok: true });
      expect((await order()).map(([id]) => id)).toEqual([lx(1), lx(3), lx(2), lx(4), lx(0)]);
      // Already there: nothing written.
      expect(await move(lx(3), { after: lx(1) })).toEqual({ ok: true, value: { moved: false } });
      // Gaps from a removal are closed by the next move.
      await removeWordListEntry(db, { ownerId, listId, lexemeId: lx(3) });
      await move(lx(0), { before: lx(1) });
      expect(await order()).toEqual([
        [lx(0), 0],
        [lx(1), 1],
        [lx(2), 2],
        [lx(4), 3],
      ]);
      expect(await move(lx(0), { before: lx(0) })).toEqual({ ok: false, error: 'INVALID' });
      expect(await move(lx(0), { before: lx(9) })).toEqual({ ok: false, error: 'NOT_FOUND' });
      expect(await move(lx(9), { before: lx(0) })).toEqual({ ok: false, error: 'NOT_FOUND' });
    });

    it('B6.7 import fit: adds what fits in order and reports what did not; reject stays all-or-nothing', async () => {
      const ownerId = await newUser();
      const made = await createWordList(db, { ownerId, title: 'Fit' });
      if (!made.ok) throw new Error(made.error);
      const listId = made.value.id;
      await addWordListEntries(db, {
        ownerId,
        listId,
        lexemeIds: published.slice(0, MAX_WORD_LIST_ENTRIES - 2).map((p) => p.lexemeId),
      });
      const batch = [lx(0), lx(500), draftLexemeId, lx(498), lx(499)];
      expect(
        await addWordListEntries(db, { ownerId, listId, lexemeIds: batch, overflow: 'fit' }),
      ).toEqual({
        ok: true,
        value: { added: 2, alreadyIn: 1, notFound: [draftLexemeId], didNotFit: 1 },
      });
      const view = await getWordList(db, { ownerId, listId });
      expect(view.ok && view.value.entries.slice(-2).map((e) => e.lexemeId)).toEqual([
        lx(500),
        lx(498),
      ]);
    }, 30_000);

    it('B6.7: a write in a caller’s transaction is rolled back with it', async () => {
      const ownerId = await newUser();
      const made = await createWordList(db, { ownerId, title: 'Tx' });
      if (!made.ok) throw new Error(made.error);
      const listId = made.value.id;
      await expect(
        db.$transaction(async (tx) => {
          const added = await addWordListEntries(tx, { ownerId, listId, lexemeIds: [lx(0)] });
          expect(added).toMatchObject({ ok: true, value: { added: 1 } });
          await createWordList(tx, { ownerId, title: 'Inner' });
          throw new Error('roll back');
        }),
      ).rejects.toThrow('roll back');
      expect(await db.wordListEntry.count({ where: { listId } })).toBe(0);
      expect(await db.wordList.count({ where: { ownerId } })).toBe(1);
    });

    it('reorder must name exactly the list’s words', async () => {
      const ownerId = await newUser();
      const created = await createWordList(db, { ownerId, title: 'R' });
      if (!created.ok) throw new Error(created.error);
      const listId = created.value.id;
      await addWordListEntries(db, { ownerId, listId, lexemeIds: [lx(0), lx(1)] });
      const INVALID = { ok: false, error: 'INVALID' };
      expect(await reorderWordListEntries(db, { ownerId, listId, lexemeIds: [lx(1)] })).toEqual(
        INVALID,
      );
      expect(
        await reorderWordListEntries(db, { ownerId, listId, lexemeIds: [lx(1), lx(1)] }),
      ).toEqual(INVALID);
      expect(
        await reorderWordListEntries(db, { ownerId, listId, lexemeIds: [lx(1), lx(2)] }),
      ).toEqual(INVALID);
    });

    it('bad title or note: INVALID before any write', async () => {
      const ownerId = await newUser();
      expect(await createWordList(db, { ownerId, title: '   ' })).toEqual({
        ok: false,
        error: 'INVALID',
      });
      expect(await createWordList(db, { ownerId, title: 'x'.repeat(81) })).toEqual({
        ok: false,
        error: 'INVALID',
      });
      expect(await db.wordList.count({ where: { ownerId } })).toBe(0);
    });
  });

  describe('CHECKs (migration 20261105120000), the last line behind Zod', () => {
    const rejects = (p: Promise<unknown>, check: string) =>
      expect(p).rejects.toThrow(new RegExp(check));

    it('title 1..80 and not blank; position >= 0; note <= 200', async () => {
      const ownerId = await newUser();
      await rejects(
        db.$executeRaw`INSERT INTO "WordList" ("id","ownerId","title","source","updatedAt")
          VALUES (${`${RUN}-c1`}, ${ownerId}, '   ', 'CUSTOM', now())`,
        'WordList_title_length',
      );
      await rejects(
        db.$executeRaw`INSERT INTO "WordList" ("id","ownerId","title","source","updatedAt")
          VALUES (${`${RUN}-c2`}, ${ownerId}, ${'x'.repeat(81)}, 'CUSTOM', now())`,
        'WordList_title_length',
      );
      const list = await db.wordList.create({
        data: { ownerId, title: 'ok', source: 'CUSTOM' },
      });
      await rejects(
        db.$executeRaw`INSERT INTO "WordListEntry" ("listId","lexemeId","position")
          VALUES (${list.id}, ${lx(0)}, -1)`,
        'WordListEntry_position_nonnegative',
      );
      await rejects(
        db.$executeRaw`INSERT INTO "WordListEntry" ("listId","lexemeId","position","note")
          VALUES (${list.id}, ${lx(0)}, 0, ${'x'.repeat(201)})`,
        'WordListEntry_note_length',
      );
      await db.$executeRaw`INSERT INTO "WordListEntry" ("listId","lexemeId","position","note")
          VALUES (${list.id}, ${lx(0)}, 0, ${'x'.repeat(200)})`;
      expect(await db.wordListEntry.count({ where: { listId: list.id } })).toBe(1);
    });
  });
});
