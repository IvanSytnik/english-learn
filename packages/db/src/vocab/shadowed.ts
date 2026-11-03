import { lexemeKey } from '../schemas/lexeme';
import { mapCefrJPos, normalizeLemma } from './normalize';

/**
 * Headwords shadowed by a left-out part of speech (B6.2b, B6-SPEC §2
 * secondarySense (b)). wordfreq counts a form, not a sense: when the source
 * lists a headword under a POS the import leaves out (modal auxiliary,
 * be-/do-/have-verb, determiner, infinitive-to), the form's frequency belongs
 * mostly to that entry, which the catalogue doesn't have — so the entry we do
 * keep (`can` noun, `half` noun, `that` conjunction) is a secondary sense.
 * Derived offline from the source CSV into the committed dataset
 * (scripts/add-cefr-j-shadowed.ts) so vocab:sync-frequency stays offline and
 * deterministic.
 */

/**
 * Forms of the be-/have-verb paradigms the source omits (it lists am, is,
 * was, been … and had, has, have, but not these). Without them `being` noun
 * would inherit the frequency of the auxiliary `being`.
 */
export const EXCLUDED_PARADIGM_GAPS: Readonly<Record<string, readonly string[]>> = {
  'be-verb': ['being'],
  'have-verb': ['having'],
};

/**
 * lemmaKeys of every spelling (`a/b` headwords split) the source lists under
 * a left-out POS, plus the paradigm gaps of the auxiliaries it lists.
 */
export function excludedHeadwordKeys(
  records: readonly { headword?: string; pos?: string }[],
): Set<string> {
  const keys = new Set<string>();
  for (const r of records) {
    const pos = r.pos ?? '';
    if (mapCefrJPos(pos) !== null) continue;
    for (const spelling of (r.headword ?? '').split('/')) {
      // not normalizeLemma: excluded headwords may be clitics (`'m`, `'s`)
      const key = lexemeKey(spelling.normalize('NFC').replace(/\s+/gu, ' '));
      if (key !== '') keys.add(key);
    }
    for (const gap of EXCLUDED_PARADIGM_GAPS[pos.trim().toLowerCase()] ?? []) keys.add(gap);
  }
  return keys;
}

/**
 * Whether a kept dataset entry is shadowed: its lemma (the first spelling,
 * not the variants — `a.m.` is not shadowed by the be-verb `am`) is one of
 * the excluded headword keys. Left-out entries themselves are never flagged.
 */
export function isShadowedByExcludedPos(
  entry: { lemma: string; pos: string },
  excluded: ReadonlySet<string>,
): boolean {
  return mapCefrJPos(entry.pos) !== null && excluded.has(normalizeLemma(entry.lemma).lemmaKey);
}
