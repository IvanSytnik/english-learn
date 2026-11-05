import type { PrismaClient } from '../generated/client/client';
import {
  MAX_ACTIVE_WORD_LISTS,
  MAX_WORD_LIST_ENTRIES,
  WordListNoteSchema,
  type WordListSourceValue,
  WordListTitleSchema,
} from '../schemas/word-list';

/**
 * A learner's word lists (B6.6 queries; the UI comes with B6.7). Every call
 * names the owner: a list of another user is NOT_FOUND — the same answer as
 * a list that does not exist, so nothing reveals that it does. Archived lists
 * are read-only (NOT_FOUND for every change but a repeated archive).
 *
 * Limits (B6-SPEC §1) are checked in the transaction that writes, under a row
 * lock — the owner's User row for a new list, the list row for its entries —
 * so two concurrent calls cannot both pass the count: <= 50 active lists per
 * owner, <= 500 entries per list. A call that would cross a limit writes
 * nothing (LIMIT). Only PUBLISHED lexemes are added.
 */

export type WordListError = 'NOT_FOUND' | 'LIMIT' | 'INVALID';
export type WordListResult<T> = { ok: true; value: T } | { ok: false; error: WordListError };

const fail = (error: WordListError) => ({ ok: false, error }) as const;
const ok = <T>(value: T) => ({ ok: true, value }) as const;

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Where a write runs: the client (it opens its own transaction) or a caller's
 * transaction — a metered write (rate-limit meteredWrite, B6.7) runs the list
 * write inside the transaction that charges it.
 */
export type WordListDb = PrismaClient | Tx;

const inTx = <T>(db: WordListDb, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  '$transaction' in db ? db.$transaction(fn) : fn(db);

/** A change to a list's words moves its "updated" date (the lists index). */
const touch = (tx: Tx, listId: string) =>
  tx.wordList.update({ where: { id: listId }, data: { updatedAt: new Date() } });

/** Locks the owner's User row: list creation and restore count the active lists under it. */
async function lockOwner(tx: Tx, ownerId: string): Promise<boolean> {
  const owner = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
  return owner.length === 1;
}

const activeLists = (tx: Tx, ownerId: string) =>
  tx.wordList.count({ where: { ownerId, archivedAt: null } });

/** Locks the owner's active list for this transaction; false when it is not theirs or archived. */
async function lockActiveList(tx: Tx, ownerId: string, listId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WordList"
    WHERE "id" = ${listId} AND "ownerId" = ${ownerId} AND "archivedAt" IS NULL
    FOR UPDATE`;
  return rows.length === 1;
}

export async function createWordList(
  db: WordListDb,
  args: { ownerId: string; title: string; source?: WordListSourceValue },
): Promise<WordListResult<{ id: string; title: string }>> {
  const title = WordListTitleSchema.safeParse(args.title);
  if (!title.success) return fail('INVALID');
  return inTx(db, async (tx) => {
    // Serializes list creation per owner: the count below cannot go stale.
    if (!(await lockOwner(tx, args.ownerId))) return fail('NOT_FOUND');
    if ((await activeLists(tx, args.ownerId)) >= MAX_ACTIVE_WORD_LISTS) return fail('LIMIT');
    const list = await tx.wordList.create({
      data: { ownerId: args.ownerId, title: title.data, source: args.source ?? 'CUSTOM' },
      select: { id: true, title: true },
    });
    return ok(list);
  });
}

export async function renameWordList(
  db: Pick<WordListDb, 'wordList'>,
  args: { ownerId: string; listId: string; title: string },
): Promise<WordListResult<{ title: string }>> {
  const title = WordListTitleSchema.safeParse(args.title);
  if (!title.success) return fail('INVALID');
  const { count } = await db.wordList.updateMany({
    where: { id: args.listId, ownerId: args.ownerId, archivedAt: null },
    data: { title: title.data },
  });
  return count === 1 ? ok({ title: title.data }) : fail('NOT_FOUND');
}

/** Archive (soft delete). Archiving an archived list of the owner is a no-op. */
export async function archiveWordList(
  db: Pick<WordListDb, 'wordList'>,
  args: { ownerId: string; listId: string },
): Promise<WordListResult<{ archived: true; changed: boolean }>> {
  const { count } = await db.wordList.updateMany({
    where: { id: args.listId, ownerId: args.ownerId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (count === 1) return ok({ archived: true, changed: true });
  const exists = await db.wordList.findFirst({
    where: { id: args.listId, ownerId: args.ownerId },
    select: { id: true },
  });
  return exists ? ok({ archived: true, changed: false }) : fail('NOT_FOUND');
}

/**
 * Bring an archived list back (B6.7). Counts against the 50 active lists
 * under the owner's row lock, like a new list (LIMIT). Restoring an active
 * list of the owner is a no-op (`changed: false`).
 */
export async function restoreWordList(
  db: WordListDb,
  args: { ownerId: string; listId: string },
): Promise<WordListResult<{ restored: true; changed: boolean }>> {
  return inTx(db, async (tx) => {
    if (!(await lockOwner(tx, args.ownerId))) return fail('NOT_FOUND');
    const list = await tx.wordList.findFirst({
      where: { id: args.listId, ownerId: args.ownerId },
      select: { archivedAt: true },
    });
    if (!list) return fail('NOT_FOUND');
    if (list.archivedAt === null) return ok({ restored: true as const, changed: false });
    if ((await activeLists(tx, args.ownerId)) >= MAX_ACTIVE_WORD_LISTS) return fail('LIMIT');
    await tx.wordList.update({ where: { id: args.listId }, data: { archivedAt: null } });
    return ok({ restored: true as const, changed: true });
  });
}

/**
 * Append words to the end of a list, in the given order. Words already in the
 * list are skipped (`alreadyIn`), unpublished ones are not added (`notFound`).
 * Crossing 500 entries: `overflow: 'reject'` (default) adds nothing (LIMIT);
 * `'fit'` (paste import, B6.7) adds the first words that fit, in order, and
 * reports the rest in `didNotFit`.
 */
export async function addWordListEntries(
  db: WordListDb,
  args: {
    ownerId: string;
    listId: string;
    lexemeIds: readonly string[];
    overflow?: 'reject' | 'fit';
  },
): Promise<
  WordListResult<{ added: number; alreadyIn: number; notFound: string[]; didNotFit: number }>
> {
  const ids = [...new Set(args.lexemeIds)];
  const fit = args.overflow === 'fit';
  if (!fit && ids.length > MAX_WORD_LIST_ENTRIES) return fail('LIMIT');
  return inTx(db, async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const published = new Set(
      (
        await tx.lexeme.findMany({
          where: { id: { in: ids }, status: 'PUBLISHED' },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    const existing = await tx.wordListEntry.findMany({
      where: { listId: args.listId },
      select: { lexemeId: true, position: true },
    });
    const inList = new Set(existing.map((e) => e.lexemeId));
    const fresh = ids.filter((id) => published.has(id) && !inList.has(id));
    const room = Math.max(0, MAX_WORD_LIST_ENTRIES - existing.length);
    if (!fit && fresh.length > room) return fail('LIMIT');
    const added = fresh.slice(0, room);
    const start = existing.reduce((max, e) => Math.max(max, e.position + 1), 0);
    if (added.length > 0) {
      await tx.wordListEntry.createMany({
        data: added.map((lexemeId, i) => ({ listId: args.listId, lexemeId, position: start + i })),
      });
      await touch(tx, args.listId);
    }
    return ok({
      added: added.length,
      alreadyIn: ids.filter((id) => inList.has(id)).length,
      notFound: ids.filter((id) => !published.has(id)),
      didNotFit: fresh.length - added.length,
    });
  });
}

export async function removeWordListEntry(
  db: WordListDb,
  args: { ownerId: string; listId: string; lexemeId: string },
): Promise<WordListResult<{ removed: true }>> {
  return inTx(db, async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const { count } = await tx.wordListEntry.deleteMany({
      where: { listId: args.listId, lexemeId: args.lexemeId },
    });
    if (count !== 1) return fail('NOT_FOUND');
    await touch(tx, args.listId);
    return ok({ removed: true as const });
  });
}

/** Where a moved word goes: right before or right after another word of the list. */
export type WordListAnchor = { before: string } | { after: string };

/**
 * Move one word next to another (B6.7: drag, and the keyboard's up / down —
 * the row above or below, possibly on the next page). Positions become
 * 0..n-1 in the new order; only rows whose position changes are written.
 * NOT_FOUND when either word is not in the list (or the list is not the
 * owner's active list); a word anchored to itself is INVALID.
 */
export async function moveWordListEntry(
  db: WordListDb,
  args: { ownerId: string; listId: string; lexemeId: string; anchor: WordListAnchor },
): Promise<WordListResult<{ moved: boolean }>> {
  const anchorId = 'before' in args.anchor ? args.anchor.before : args.anchor.after;
  if (anchorId === args.lexemeId) return fail('INVALID');
  return inTx(db, async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const entries = await tx.wordListEntry.findMany({
      where: { listId: args.listId },
      select: { lexemeId: true, position: true },
      orderBy: [{ position: 'asc' }, { lexemeId: 'asc' }],
    });
    const order = entries.map((e) => e.lexemeId);
    const from = order.indexOf(args.lexemeId);
    if (from < 0 || !order.includes(anchorId)) return fail('NOT_FOUND');
    order.splice(from, 1);
    const at = order.indexOf(anchorId) + ('before' in args.anchor ? 0 : 1);
    order.splice(at, 0, args.lexemeId);
    const changed = order.flatMap((lexemeId, position) =>
      entries[position]?.lexemeId === lexemeId && entries[position]?.position === position
        ? []
        : [{ lexemeId, position }],
    );
    if (changed.length === 0) return ok({ moved: false });
    await tx.$executeRaw`
      UPDATE "WordListEntry" e SET "position" = v.position
      FROM unnest(${changed.map((c) => c.lexemeId)}::text[], ${changed.map((c) => c.position)}::int[])
        AS v("lexemeId", position)
      WHERE e."listId" = ${args.listId} AND e."lexemeId" = v."lexemeId"`;
    await touch(tx, args.listId);
    return ok({ moved: true });
  });
}

/**
 * New order of the whole list: `lexemeIds` must be exactly its entries
 * (INVALID otherwise); positions become 0..n-1, one statement.
 */
export async function reorderWordListEntries(
  db: WordListDb,
  args: { ownerId: string; listId: string; lexemeIds: readonly string[] },
): Promise<WordListResult<{ count: number }>> {
  return inTx(db, async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const entries = await tx.wordListEntry.findMany({
      where: { listId: args.listId },
      select: { lexemeId: true },
    });
    const current = new Set(entries.map((e) => e.lexemeId));
    const order = [...args.lexemeIds];
    if (
      new Set(order).size !== order.length ||
      order.length !== current.size ||
      !order.every((id) => current.has(id))
    ) {
      return fail('INVALID');
    }
    const positions = order.map((_, i) => i);
    await tx.$executeRaw`
      UPDATE "WordListEntry" e SET "position" = v.position
      FROM unnest(${order}::text[], ${positions}::int[]) AS v("lexemeId", position)
      WHERE e."listId" = ${args.listId} AND e."lexemeId" = v."lexemeId"`;
    return ok({ count: order.length });
  });
}

/** Set or clear (empty / null) the note of one entry. */
export async function setWordListEntryNote(
  db: WordListDb,
  args: { ownerId: string; listId: string; lexemeId: string; note: string | null },
): Promise<WordListResult<{ note: string | null }>> {
  const note = WordListNoteSchema.safeParse(args.note ?? '');
  if (!note.success) return fail('INVALID');
  return inTx(db, async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const { count } = await tx.wordListEntry.updateMany({
      where: { listId: args.listId, lexemeId: args.lexemeId },
      data: { note: note.data },
    });
    if (count !== 1) return fail('NOT_FOUND');
    await touch(tx, args.listId);
    return ok({ note: note.data });
  });
}

export type WordListView = {
  id: string;
  title: string;
  source: WordListSourceValue;
  archivedAt: Date | null;
  entries: { lexemeId: string; position: number; note: string | null }[];
};

export type WordListSummary = {
  id: string;
  title: string;
  source: WordListSourceValue;
  updatedAt: Date;
  archivedAt: Date | null;
  /** The list's words in list order (any status: the caller shows what it can). */
  lexemeIds: string[];
};

/**
 * Every list of the owner (B6.7 lists index): active ones by last change,
 * newest first, then archived ones by archive date, newest first.
 */
export async function listWordLists(
  db: Pick<WordListDb, 'wordList'>,
  ownerId: string,
): Promise<WordListSummary[]> {
  const rows = await db.wordList.findMany({
    where: { ownerId },
    select: {
      id: true,
      title: true,
      source: true,
      updatedAt: true,
      archivedAt: true,
      entries: {
        select: { lexemeId: true },
        orderBy: [{ position: 'asc' }, { lexemeId: 'asc' }],
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  });
  const summaries = rows.map(({ entries, ...list }) => ({
    ...list,
    lexemeIds: entries.map((e) => e.lexemeId),
  }));
  const time = (d: Date | null) => d?.getTime() ?? 0;
  return [
    ...summaries.filter((l) => l.archivedAt === null),
    ...summaries
      .filter((l) => l.archivedAt !== null)
      .sort((a, b) => time(b.archivedAt) - time(a.archivedAt) || (a.id < b.id ? -1 : 1)),
  ];
}

/** One list of the owner (archived too), entries in list order. */
export async function getWordList(
  db: Pick<WordListDb, 'wordList'>,
  args: { ownerId: string; listId: string },
): Promise<WordListResult<WordListView>> {
  const list = await db.wordList.findFirst({
    where: { id: args.listId, ownerId: args.ownerId },
    select: {
      id: true,
      title: true,
      source: true,
      archivedAt: true,
      entries: {
        select: { lexemeId: true, position: true, note: true },
        orderBy: [{ position: 'asc' }, { lexemeId: 'asc' }],
      },
    },
  });
  return list ? ok(list) : fail('NOT_FOUND');
}

/**
 * A list session's NEW candidates (B6.6 `scope.kind = 'list'`): the
 * PUBLISHED VOCAB_WORD items of the list's PUBLISHED lexemes. Null when the
 * list is not the owner's or is archived. AI-generated UNVERIFIED words
 * (B6.10) are not served here yet.
 */
export async function getWordListItemIds(
  db: Pick<PrismaClient, '$queryRaw'>,
  args: { ownerId: string; listId: string },
): Promise<string[] | null> {
  const rows = await db.$queryRaw<{ listId: string; itemId: string | null }[]>`
    SELECT w."id" AS "listId", i."id" AS "itemId"
    FROM "WordList" w
    LEFT JOIN "WordListEntry" e ON e."listId" = w."id"
    LEFT JOIN "Lexeme" l ON l."id" = e."lexemeId" AND l."status" = 'PUBLISHED'
    LEFT JOIN "Item" i ON i."lexemeId" = l."id"
      AND i."kind" = 'VOCAB_WORD' AND i."status" = 'PUBLISHED'
    WHERE w."id" = ${args.listId} AND w."ownerId" = ${args.ownerId} AND w."archivedAt" IS NULL`;
  if (rows.length === 0) return null;
  return rows.flatMap((r) => (r.itemId === null ? [] : [r.itemId]));
}
