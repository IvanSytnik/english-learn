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

/** Locks the owner's active list for this transaction; false when it is not theirs or archived. */
async function lockActiveList(tx: Tx, ownerId: string, listId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "WordList"
    WHERE "id" = ${listId} AND "ownerId" = ${ownerId} AND "archivedAt" IS NULL
    FOR UPDATE`;
  return rows.length === 1;
}

export async function createWordList(
  db: PrismaClient,
  args: { ownerId: string; title: string; source?: WordListSourceValue },
): Promise<WordListResult<{ id: string; title: string }>> {
  const title = WordListTitleSchema.safeParse(args.title);
  if (!title.success) return fail('INVALID');
  return db.$transaction(async (tx) => {
    // Serializes list creation per owner: the count below cannot go stale.
    const owner = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${args.ownerId} FOR UPDATE`;
    if (owner.length === 0) return fail('NOT_FOUND');
    const active = await tx.wordList.count({
      where: { ownerId: args.ownerId, archivedAt: null },
    });
    if (active >= MAX_ACTIVE_WORD_LISTS) return fail('LIMIT');
    const list = await tx.wordList.create({
      data: { ownerId: args.ownerId, title: title.data, source: args.source ?? 'CUSTOM' },
      select: { id: true, title: true },
    });
    return ok(list);
  });
}

export async function renameWordList(
  db: Pick<PrismaClient, 'wordList'>,
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
  db: Pick<PrismaClient, 'wordList'>,
  args: { ownerId: string; listId: string },
): Promise<WordListResult<{ archived: true }>> {
  const { count } = await db.wordList.updateMany({
    where: { id: args.listId, ownerId: args.ownerId, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  if (count === 1) return ok({ archived: true });
  const exists = await db.wordList.findFirst({
    where: { id: args.listId, ownerId: args.ownerId },
    select: { id: true },
  });
  return exists ? ok({ archived: true }) : fail('NOT_FOUND');
}

/**
 * Append words to the end of a list, in the given order. Words already in the
 * list are skipped (`alreadyIn`), unpublished ones are not added (`notFound`).
 * Crossing 500 entries adds nothing (LIMIT).
 */
export async function addWordListEntries(
  db: PrismaClient,
  args: { ownerId: string; listId: string; lexemeIds: readonly string[] },
): Promise<WordListResult<{ added: number; alreadyIn: number; notFound: string[] }>> {
  const ids = [...new Set(args.lexemeIds)];
  if (ids.length > MAX_WORD_LIST_ENTRIES) return fail('LIMIT');
  return db.$transaction(async (tx) => {
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
    if (existing.length + fresh.length > MAX_WORD_LIST_ENTRIES) return fail('LIMIT');
    const start = existing.reduce((max, e) => Math.max(max, e.position + 1), 0);
    await tx.wordListEntry.createMany({
      data: fresh.map((lexemeId, i) => ({ listId: args.listId, lexemeId, position: start + i })),
    });
    await tx.wordList.update({ where: { id: args.listId }, data: { updatedAt: new Date() } });
    return ok({
      added: fresh.length,
      alreadyIn: ids.filter((id) => inList.has(id)).length,
      notFound: ids.filter((id) => !published.has(id)),
    });
  });
}

export async function removeWordListEntry(
  db: PrismaClient,
  args: { ownerId: string; listId: string; lexemeId: string },
): Promise<WordListResult<{ removed: true }>> {
  return db.$transaction(async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const { count } = await tx.wordListEntry.deleteMany({
      where: { listId: args.listId, lexemeId: args.lexemeId },
    });
    return count === 1 ? ok({ removed: true as const }) : fail('NOT_FOUND');
  });
}

/**
 * New order of the whole list: `lexemeIds` must be exactly its entries
 * (INVALID otherwise); positions become 0..n-1, one statement.
 */
export async function reorderWordListEntries(
  db: PrismaClient,
  args: { ownerId: string; listId: string; lexemeIds: readonly string[] },
): Promise<WordListResult<{ count: number }>> {
  return db.$transaction(async (tx) => {
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
  db: PrismaClient,
  args: { ownerId: string; listId: string; lexemeId: string; note: string | null },
): Promise<WordListResult<{ note: string | null }>> {
  const note = WordListNoteSchema.safeParse(args.note ?? '');
  if (!note.success) return fail('INVALID');
  return db.$transaction(async (tx) => {
    if (!(await lockActiveList(tx, args.ownerId, args.listId))) return fail('NOT_FOUND');
    const { count } = await tx.wordListEntry.updateMany({
      where: { listId: args.listId, lexemeId: args.lexemeId },
      data: { note: note.data },
    });
    return count === 1 ? ok({ note: note.data }) : fail('NOT_FOUND');
  });
}

export type WordListView = {
  id: string;
  title: string;
  source: WordListSourceValue;
  archivedAt: Date | null;
  entries: { lexemeId: string; position: number; note: string | null }[];
};

/** One list of the owner (archived too), entries in list order. */
export async function getWordList(
  db: Pick<PrismaClient, 'wordList'>,
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
