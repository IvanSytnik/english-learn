import { CEFR_RANK } from '../core/graph/types';
import type { Rng } from '../policy/rng';
import { glossKey, glossOf } from './text';
import type { VocabLexeme, VocabLocale } from './types';

/**
 * Deterministic distractor picker: `count` other words for a choice question,
 * drawn tier by tier until there are enough —
 *   1. same topic concept, same POS (same topic and level);
 *   2. same level, same POS, any topic;
 *   3. an adjacent level, same POS;
 *   4. same level, any POS.
 * Each tier is sorted by id and shuffled with the injected Rng, so the same
 * seed always yields the same choices (the grader rebuilds the card).
 *
 * Never offered: the target itself, a word with the same lemmaKey (`March` /
 * `march`), a word whose gloss in the learner's language equals the target's
 * (`above` / `over` → «над»: two right answers), or a word whose option text
 * (`optionOf`) is missing or repeats one already chosen. `optionOf` decides
 * what the learner sees — a gloss, a lemma, a matching surface form.
 *
 * With `avoidGlossOverlap` (the recognition modes, B6-SPEC V2-14) a word
 * whose gloss shares a content word with the target's is not offered either
 * («директор / режиссёр» vs «директор школы»: two right answers) — see
 * glossOverlapPool.
 */
export const DISTRACTOR_COUNT = 3;

/**
 * Words of three letters or more that carry no meaning of their own in a
 * gloss (V2-14): articles, pronouns, prepositions, particles, "be", and the
 * "something / somebody" placeholders. Shorter tokens never count, so `в`,
 * `на`, `zu` need no entry. English is not filtered (its "gloss" is the
 * definition, where shared words are the norm).
 */
export const GLOSS_STOP_WORDS: Readonly<Record<Exclude<VocabLocale, 'en'>, ReadonlySet<string>>> =
  Object.freeze({
    ru: new Set([
      'без',
      'быть',
      'все',
      'всё',
      'где',
      'для',
      'ещё',
      'или',
      'как',
      'кем',
      'кого',
      'когда',
      'ком',
      'кому',
      'кто',
      'куда',
      'либо',
      'над',
      'нибудь',
      'под',
      'при',
      'про',
      'себе',
      'себя',
      'собой',
      'так',
      'также',
      'тоже',
      'тот',
      'угодно',
      'уже',
      'чего',
      'чем',
      'чём',
      'чему',
      'через',
      'что',
      'это',
    ]),
    uk: new Set([
      'або',
      'без',
      'будь',
      'бути',
      'все',
      'всі',
      'вже',
      'від',
      'для',
      'кого',
      'когось',
      'коли',
      'кому',
      'комусь',
      'куди',
      'між',
      'над',
      'небудь',
      'під',
      'при',
      'про',
      'себе',
      'собі',
      'так',
      'також',
      'теж',
      'той',
      'хто',
      'хтось',
      'чимось',
      'чогось',
      'чомусь',
      'через',
      'щоб',
      'щось',
      'це',
    ]),
    de: new Set([
      'als',
      'auf',
      'aus',
      'bei',
      'bis',
      'das',
      'dem',
      'den',
      'der',
      'des',
      'die',
      'durch',
      'ein',
      'eine',
      'einem',
      'einen',
      'einer',
      'eines',
      'etw',
      'etwas',
      'für',
      'gegen',
      'ihn',
      'ihr',
      'jdm',
      'jdn',
      'jds',
      'jemand',
      'jemandem',
      'jemanden',
      'mit',
      'nach',
      'nicht',
      'ohne',
      'oder',
      'sein',
      'sich',
      'sie',
      'über',
      'und',
      'unter',
      'von',
      'vor',
      'zum',
      'zur',
    ]),
  });

const LETTERS = /\p{L}/gu;
// Letters, with an apostrophe inside a word kept (uk `пам'ять`, de `geht's`).
const TOKEN = /\p{L}+(?:'\p{L}+)*/gu;

/**
 * The content words of a gloss (V2-14): NFC, lower case, split on anything
 * that is not a letter (spaces, `/`, `,`, `;`, parentheses, hyphens), kept
 * when three letters or longer and not a stop word of `locale`. Empty for
 * `en`.
 */
export function glossContentWords(gloss: string, locale: VocabLocale): ReadonlySet<string> {
  if (locale === 'en') return new Set();
  const stop = GLOSS_STOP_WORDS[locale];
  const text = gloss.normalize('NFC').toLowerCase().replace(/[‘’ʼ]/g, "'");
  return new Set(
    [...text.matchAll(TOKEN)]
      .map((m) => m[0])
      .filter((w) => (w.match(LETTERS)?.length ?? 0) >= 3 && !stop.has(w)),
  );
}

// Memo per lexeme object: every card compares the target with the whole pool.
const contentWordMemo = new WeakMap<
  VocabLexeme,
  Partial<Record<VocabLocale, ReadonlySet<string>>>
>();

function contentWordsOf(lexeme: VocabLexeme, locale: VocabLocale): ReadonlySet<string> {
  const memo = contentWordMemo.get(lexeme) ?? {};
  const words = memo[locale] ?? glossContentWords(glossOf(lexeme, locale), locale);
  memo[locale] = words;
  contentWordMemo.set(lexeme, memo);
  return words;
}

/** The two words' glosses in `locale` share a content word (V2-14). */
export function glossesOverlap(a: VocabLexeme, b: VocabLexeme, locale: VocabLocale): boolean {
  const aw = contentWordsOf(a, locale);
  if (aw.size === 0) return false;
  for (const w of contentWordsOf(b, locale)) if (aw.has(w)) return true;
  return false;
}

export type Distractor = { lexeme: VocabLexeme; option: string };

export function pickDistractors(args: {
  target: VocabLexeme;
  pool: readonly VocabLexeme[];
  locale: VocabLocale;
  rng: Rng;
  /** Option text for a candidate; null = it cannot be offered in this question. */
  optionOf: (lexeme: VocabLexeme) => string | null;
  /** The target's own option text (never repeated by a distractor). */
  targetOption: string;
  count?: number;
  /** Leave out words whose gloss shares a content word with the target's (V2-14). */
  avoidGlossOverlap?: boolean;
}): Distractor[] {
  const { target, locale, rng, optionOf } = args;
  const count = args.count ?? DISTRACTOR_COUNT;
  const tiers = distractorTiers(target);
  const eligible = eligiblePool(args.pool, target, locale);
  const pool = args.avoidGlossOverlap
    ? glossOverlapPool({
        eligible,
        target,
        locale,
        optionOf,
        targetOption: args.targetOption,
        count,
      }).pool
    : eligible;

  const chosen: Distractor[] = [];
  const taken = new Set<string>();
  const seenOptions = new Set([args.targetOption.toLowerCase()]);
  for (const inTier of tiers) {
    if (chosen.length >= count) break;
    for (const lexeme of shuffle(
      pool.filter((l) => !taken.has(l.id) && inTier(l)),
      rng,
    )) {
      if (chosen.length >= count) break;
      const option = optionOf(lexeme);
      if (option === null || seenOptions.has(option.toLowerCase())) continue;
      taken.add(lexeme.id);
      seenOptions.add(option.toLowerCase());
      chosen.push({ lexeme, option });
    }
  }
  return chosen;
}

type Tier = (l: VocabLexeme) => boolean;

function distractorTiers(target: VocabLexeme): readonly Tier[] {
  const rank = CEFR_RANK[target.cefrLevel];
  return [
    (l) => l.conceptId === target.conceptId && l.pos === target.pos,
    (l) => l.cefrLevel === target.cefrLevel && l.pos === target.pos,
    (l) => Math.abs(CEFR_RANK[l.cefrLevel] - rank) === 1 && l.pos === target.pos,
    (l) => l.cefrLevel === target.cefrLevel,
  ];
}

/** Every word that may stand next to `target` at all, sorted by id. */
function eligiblePool(
  pool: readonly VocabLexeme[],
  target: VocabLexeme,
  locale: VocabLocale,
): VocabLexeme[] {
  const targetGloss = glossKey(target, locale);
  return pool
    .filter(
      (l) =>
        l.id !== target.id && l.lemmaKey !== target.lemmaKey && glossKey(l, locale) !== targetGloss,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The V2-14 filter, applied once before picking, across all tiers: the
 * eligible words minus those whose gloss shares a content word with the
 * target's. If fewer than `count` distinct options would remain in the tiers,
 * the unfiltered pool is kept as it is (`fellBack`) — the card is the one it
 * was before the filter, never a re-pick. `removed` = words the filter took
 * out (0 → the pick is unchanged).
 */
export function glossOverlapPool(args: {
  eligible: readonly VocabLexeme[];
  target: VocabLexeme;
  locale: VocabLocale;
  optionOf: (lexeme: VocabLexeme) => string | null;
  targetOption: string;
  count: number;
}): { pool: readonly VocabLexeme[]; removed: number; fellBack: boolean } {
  const { eligible, target, locale } = args;
  const filtered = eligible.filter((l) => !glossesOverlap(target, l, locale));
  const removed = eligible.length - filtered.length;
  if (removed === 0) return { pool: eligible, removed, fellBack: false };
  const tiers = distractorTiers(target);
  const options = new Set([args.targetOption.toLowerCase()]);
  for (const l of filtered) {
    if (options.size > args.count) break;
    if (!tiers.some((inTier) => inTier(l))) continue;
    const option = args.optionOf(l);
    if (option !== null) options.add(option.toLowerCase());
  }
  // The target's own option is in the set: `count` distractors need count + 1.
  return options.size > args.count
    ? { pool: filtered, removed, fellBack: false }
    : { pool: eligible, removed, fellBack: true };
}

/**
 * What the V2-14 filter does to one question (the real-pool report and its
 * tests): how many words it took out, and whether it fell back.
 */
export function glossOverlapEffect(args: {
  target: VocabLexeme;
  pool: readonly VocabLexeme[];
  locale: VocabLocale;
  optionOf: (lexeme: VocabLexeme) => string | null;
  targetOption: string;
  count?: number;
}): { removed: number; fellBack: boolean } {
  const { removed, fellBack } = glossOverlapPool({
    ...args,
    eligible: eligiblePool(args.pool, args.target, args.locale),
    count: args.count ?? DISTRACTOR_COUNT,
  });
  return { removed, fellBack };
}

/** Fisher–Yates on a copy, driven by the injected Rng. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
