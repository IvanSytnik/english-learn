import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../create-client';
import type { PrismaClient } from '../../generated/client/client';
import { getPublishedVocabLexemes } from '../vocab-lexemes';
import { hasItemReviewState } from '../vocab-session';

/**
 * The card builder's vocabulary on real Postgres (B2.6): only PUBLISHED
 * VOCAB_WORD items on PUBLISHED lexemes, joined with the item's concept and
 * variants; a row whose JSON does not parse is left out and reported. Same
 * gate as the other DB tests (DIAG_DB_TEST_URL; required in CI). Rows carry
 * this run's tag.
 */

const url = process.env.DIAG_DB_TEST_URL;
if (!url && process.env.CI) {
  throw new Error('DIAG_DB_TEST_URL is not set in CI: the vocab lexemes DB test would be skipped');
}

const RUN = `test-vlex-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CONCEPT = `${RUN}.vocab`;

describe.skipIf(!url)('published vocabulary for cards (real Postgres)', () => {
  let prisma: PrismaClient;
  const ids: Record<string, string> = {};

  const word = async (
    tag: string,
    opts: {
      lexemeStatus?: 'PUBLISHED' | 'REVIEW';
      itemStatus?: 'PUBLISHED' | 'ARCHIVED';
      examples?: unknown[];
    } = {},
  ) => {
    const lemma = `${RUN}-${tag}`;
    const lexeme = await prisma.lexeme.create({
      data: {
        lemma,
        lemmaKey: lemma,
        pos: 'NOUN',
        cefrLevel: 'A2',
        cefrJLevel: 'A2',
        ipa: '/x/',
        definitions: { en: `def ${tag}` },
        translations: { ru: `ru ${tag}`, de: `de ${tag}` },
        examples: (opts.examples ?? [
          { sentence: `The ${lemma} is here.`, translation: { ru: 'x' }, clozeTarget: lemma },
        ]) as object[],
        status: opts.lexemeStatus ?? 'PUBLISHED',
      },
    });
    const item = await prisma.item.create({
      data: {
        conceptId: CONCEPT,
        kind: 'VOCAB_WORD',
        cefrLevel: 'A2',
        status: opts.itemStatus ?? 'PUBLISHED',
        content: { headword: lemma, variants: [`${lemma}-variant`] },
        lexemeId: lexeme.id,
      },
    });
    ids[tag] = item.id;
    return { lexemeId: lexeme.id, itemId: item.id };
  };

  beforeAll(async () => {
    prisma = createPrismaClient(url);
    await prisma.concept.create({
      data: { id: CONCEPT, name: 'vocab', cefrLevel: 'A2', category: 'VOCAB' },
    });
    await word('ok');
    await word('review', { lexemeStatus: 'REVIEW' });
    await word('archived', { itemStatus: 'ARCHIVED' });
    await word('broken', { examples: [] });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.item.deleteMany({ where: { conceptId: CONCEPT } });
    await prisma.concept.deleteMany({ where: { id: CONCEPT } });
    await prisma.lexeme.deleteMany({ where: { lemmaKey: { startsWith: RUN } } });
    await prisma.$disconnect();
  });

  it('returns published words joined with concept and variants', async () => {
    const { rows } = await getPublishedVocabLexemes(prisma);
    const ok = rows.find((r) => r.itemId === ids.ok);
    expect(ok).toMatchObject({
      lemma: `${RUN}-ok`,
      lemmaKey: `${RUN}-ok`,
      pos: 'NOUN',
      cefrLevel: 'A2',
      conceptId: CONCEPT,
      ipa: '/x/',
      definitions: { en: 'def ok' },
      translations: { ru: 'ru ok', de: 'de ok' },
      variants: [`${RUN}-ok-variant`],
    });
    expect(ok?.examples).toHaveLength(1);
    expect(ok?.id).not.toBe(ids.ok);
  });

  it('leaves out unpublished lexemes and items', async () => {
    const { rows, invalidItemIds } = await getPublishedVocabLexemes(prisma);
    const itemIds = new Set(rows.map((r) => r.itemId));
    expect(itemIds.has(ids.review as string)).toBe(false);
    expect(itemIds.has(ids.archived as string)).toBe(false);
    expect(invalidItemIds).not.toContain(ids.review);
  });

  it('reports a row that does not parse instead of serving it', async () => {
    const { rows, invalidItemIds } = await getPublishedVocabLexemes(prisma);
    expect(rows.map((r) => r.itemId)).not.toContain(ids.broken);
    expect(invalidItemIds).toContain(ids.broken);
  });

  it('hasItemReviewState sees only this learner’s row', async () => {
    const user = await prisma.user.create({ data: { email: `${RUN}-a@test.dev` } });
    const other = await prisma.user.create({ data: { email: `${RUN}-b@test.dev` } });
    const itemId = ids.ok as string;
    expect(await hasItemReviewState(prisma, { userId: user.id, itemId })).toBe(false);
    await prisma.itemReviewState.create({
      data: { userId: other.id, itemId, stability: 1, difficulty: 5, dueAt: 1n },
    });
    expect(await hasItemReviewState(prisma, { userId: user.id, itemId })).toBe(false);
    expect(await hasItemReviewState(prisma, { userId: other.id, itemId })).toBe(true);
  });
});
