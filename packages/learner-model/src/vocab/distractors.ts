import { CEFR_RANK } from '../core/graph/types';
import type { Rng } from '../policy/rng';
import { glossKey } from './text';
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
 */
export const DISTRACTOR_COUNT = 3;

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
}): Distractor[] {
  const { target, locale, rng, optionOf } = args;
  const count = args.count ?? DISTRACTOR_COUNT;
  const targetGloss = glossKey(target, locale);
  const rank = CEFR_RANK[target.cefrLevel];

  const eligible = [...args.pool]
    .filter(
      (l) =>
        l.id !== target.id && l.lemmaKey !== target.lemmaKey && glossKey(l, locale) !== targetGloss,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const tiers: ((l: VocabLexeme) => boolean)[] = [
    (l) => l.conceptId === target.conceptId && l.pos === target.pos,
    (l) => l.cefrLevel === target.cefrLevel && l.pos === target.pos,
    (l) => Math.abs(CEFR_RANK[l.cefrLevel] - rank) === 1 && l.pos === target.pos,
    (l) => l.cefrLevel === target.cefrLevel,
  ];

  const chosen: Distractor[] = [];
  const taken = new Set<string>();
  const seenOptions = new Set([args.targetOption.toLowerCase()]);
  for (const inTier of tiers) {
    if (chosen.length >= count) break;
    for (const lexeme of shuffle(
      eligible.filter((l) => !taken.has(l.id) && inTier(l)),
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

/** Fisher–Yates on a copy, driven by the injected Rng. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
