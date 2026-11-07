import 'server-only';
import { prisma } from '@englishlearn/db';
import { getWordList } from '@englishlearn/db/queries/word-lists';
import {
  type CefrLevelValue,
  type Locale,
  MAX_WORD_LIST_ENTRIES,
  type PartOfSpeechValue,
} from '@englishlearn/db/schemas';
import {
  buildCatalogueIndex,
  type CatalogueIndex,
  glossOf,
  type ImportEntry,
  matchCandidates,
  tokenizePaste,
} from '@englishlearn/learner-model';
import type { Result } from '@/lib/result';
import { getVocabPool, type VocabPool } from '@/lib/vocab-pool';
import { learnerLocale } from '@/lib/vocab-session';
import {
  type AddedWords,
  addWords,
  createList,
  type ListError,
  withinSearchBudget,
} from '@/lib/word-lists';

/**
 * Paste import (B6.7, B6-SPEC §5): preview pasted text against the PUBLISHED
 * catalogue, then add the words the learner chose. V2-17: the text lives
 * only in this request — never stored, logged or sent anywhere; what is not
 * found goes back to the learner's screen and nowhere else. Words travel by
 * slug only. Function words the catalogue leaves out are their own group,
 * never "not found" (V2-18c).
 */

export type ImportOptionView = {
  slug: string;
  headword: string;
  pos: PartOfSpeechValue;
  level: CefrLevelValue;
  gloss: string;
  inList: boolean;
};
export type ImportEntryView = {
  term: string;
  options: ImportOptionView[];
  /** Checked at first; null = the learner chooses (several lemmas, or already in the list). */
  preselected: string | null;
};
export type ImportPreviewView = {
  /** Language of the glosses (`lang` on screen). */
  glossLang: string;
  matched: ImportEntryView[];
  lemmatized: ImportEntryView[];
  /** Function words the catalogue leaves out (`was`, `the`): shown, not practised, never "not found". */
  functionWords: string[];
  notFound: string[];
  notProcessed: number;
  skipped: number;
  /** Words the target list can still take (500 for a new list). */
  capacityLeft: number;
};
export type ImportPreviewError = 'TOO_LONG' | 'EMPTY' | 'NOT_FOUND' | 'RATE_LIMITED';

/** One index per pool: the pool is cached per deployment, so is its index. */
const indexes = new WeakMap<VocabPool, CatalogueIndex>();

export function catalogueIndexOf(pool: VocabPool): CatalogueIndex {
  let index = indexes.get(pool);
  if (!index) {
    index = buildCatalogueIndex(
      pool.lexemes.flatMap((row) => {
        const slug = pool.slugByItemId.get(row.itemId);
        return slug === undefined
          ? []
          : [
              {
                slug,
                lemma: row.lemma,
                lemmaKey: row.lemmaKey,
                pos: row.pos,
                variants: row.variants,
                frequencyRank: row.frequencyRank,
              },
            ];
      }),
    );
    indexes.set(pool, index);
  }
  return index;
}

export async function previewImport(args: {
  userId: string;
  uiLocale: Locale;
  text: string;
  listId?: string;
}): Promise<Result<ImportPreviewView, ImportPreviewError>> {
  const tokens = tokenizePaste(args.text);
  if (!tokens.ok) return tokens;
  if (!(await withinSearchBudget(args.userId))) return { ok: false, error: 'RATE_LIMITED' };
  const [pool, locale, list] = await Promise.all([
    getVocabPool(),
    learnerLocale(args.userId, args.uiLocale),
    args.listId === undefined
      ? Promise.resolve(null)
      : getWordList(prisma, { ownerId: args.userId, listId: args.listId }),
  ]);
  if (list && (!list.ok || list.value.archivedAt !== null))
    return { ok: false, error: 'NOT_FOUND' };
  const inList = new Set(list?.ok ? list.value.entries.map((e) => e.lexemeId) : []);
  const match = matchCandidates(tokens.candidates, catalogueIndexOf(pool));

  const option = (slug: string): ImportOptionView | null => {
    const row = pool.bySlug.get(slug);
    if (!row) return null;
    const { lemma, pos, cefrLevel, id } = row;
    return {
      slug,
      headword: lemma,
      pos,
      level: cefrLevel,
      gloss: glossOf(row, locale),
      inList: inList.has(id),
    };
  };
  const view = (entry: ImportEntry): ImportEntryView => {
    const options = entry.slugs.flatMap((s) => option(s) ?? []);
    const first = options.find((o) => o.slug === entry.preselected);
    return { term: entry.term, options, preselected: first && !first.inList ? first.slug : null };
  };
  return {
    ok: true,
    value: {
      glossLang: locale,
      matched: match.matched.map(view),
      lemmatized: match.lemmatized.map(view),
      functionWords: match.functionWords,
      notFound: match.notFound,
      notProcessed: tokens.notProcessed + match.notProcessed,
      skipped: tokens.skipped,
      capacityLeft: MAX_WORD_LIST_ENTRIES - (list?.ok ? list.value.entries.length : 0),
    },
  };
}

/**
 * Add the chosen words: to one of the learner's lists, or to a new list
 * (source IMPORT). Words already in the list are skipped and counted; past
 * 500 the rest is reported, not added.
 */
export function confirmImport(args: {
  userId: string;
  slugs: readonly string[];
  target: { listId: string } | { title: string };
}): Promise<Result<{ listId: string } & AddedWords, ListError>> {
  const slugs = [...new Set(args.slugs)];
  if ('listId' in args.target) {
    const { listId } = args.target;
    return addWords({ userId: args.userId, listId, slugs, overflow: 'fit' }).then((res) =>
      res.ok ? { ok: true, value: { listId, ...res.value } } : res,
    );
  }
  return createList({
    userId: args.userId,
    title: args.target.title,
    slugs,
    source: 'IMPORT',
    overflow: 'fit',
  }).then((res) => {
    if (!res.ok) return res;
    const { id, title: _title, ...counts } = res.value;
    return { ok: true, value: { listId: id, ...counts } };
  });
}
