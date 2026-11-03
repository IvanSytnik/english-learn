import type { PartOfSpeechValue } from '../schemas/lexeme';

/**
 * IPA from CMUdict (B6.4a): a deterministic ARPAbet → IPA (General American)
 * conversion with primary `ˈ` and secondary `ˌ` stress marks, placed before
 * the stressed syllable by the maximal-onset rule. Pure; the offline script
 * scripts/build-ipa-cmudict.ts applies it to the catalogue and commits only
 * the derived `{ lemmaKey: ipa }` file.
 *
 * A word with several CMUdict pronunciations (B6.2b, Ivan's decision 3.a):
 * 1. a row of the hand-written IPA_HETERONYMS table for [lemmaKey, pos]
 *    wins — heteronyms of one shape (`use` jus / juz, `live`) need it;
 * 2. variants of different shape — another syllable count or another
 *    primary-stress syllable (`record` ˈrɛkɚd / rɪˈkɔrd) — and no row → null,
 *    never a guess;
 * 3. otherwise the strong form: the variant with the fewest reduced vowels
 *    (AH0, IH0, ER0), the first on a tie — `and` ænd, not ənd; `to` tu.
 */

export type Arpabet = readonly string[];

const VOWELS: Readonly<Record<string, string>> = {
  AA: 'ɑ',
  AE: 'æ',
  AO: 'ɔ',
  AW: 'aʊ',
  AY: 'aɪ',
  EH: 'ɛ',
  EY: 'eɪ',
  IH: 'ɪ',
  IY: 'i',
  OW: 'oʊ',
  OY: 'ɔɪ',
  UH: 'ʊ',
  UW: 'u',
};
const CONSONANTS: Readonly<Record<string, string>> = {
  B: 'b',
  CH: 'tʃ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'dʒ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'r',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

const isVowel = (phone: string) => /\d$/.test(phone);
const base = (phone: string) => phone.replace(/\d$/, '');
const stress = (phone: string) => Number(phone.at(-1));

/** Legal English syllable onsets (in ARPAbet), for the maximal-onset rule. */
const ONSETS = new Set([
  ...Object.keys(CONSONANTS).filter((c) => c !== 'NG'),
  'P L',
  'P R',
  'P Y',
  'B L',
  'B R',
  'B Y',
  'T R',
  'T W',
  'T Y',
  'D R',
  'D W',
  'D Y',
  'K L',
  'K R',
  'K W',
  'K Y',
  'G L',
  'G R',
  'G W',
  'G Y',
  'F L',
  'F R',
  'F Y',
  'TH R',
  'TH W',
  'SH R',
  'S L',
  'S M',
  'S N',
  'S P',
  'S T',
  'S K',
  'S W',
  'S F',
  'M Y',
  'N Y',
  'V Y',
  'HH Y',
  'L Y',
  'S P L',
  'S P R',
  'S T R',
  'S K R',
  'S K W',
  'S K Y',
  'S P Y',
]);

function vowelIpa(phone: string): string {
  const b = base(phone);
  const s = stress(phone);
  if (b === 'AH') return s === 0 ? 'ə' : 'ʌ';
  if (b === 'ER') return s === 0 ? 'ɚ' : 'ɝ';
  const v = VOWELS[b];
  if (v === undefined) throw new Error(`Unknown ARPAbet vowel ${phone}`);
  return v;
}

function consonantIpa(phone: string): string {
  const c = CONSONANTS[phone];
  if (c === undefined) throw new Error(`Unknown ARPAbet phone ${phone}`);
  return c;
}

/**
 * One word's ARPAbet as IPA. A one-syllable word carries no stress mark;
 * otherwise `ˈ` / `ˌ` go before the onset of the syllable whose vowel has
 * stress 1 / 2. The onset of a vowel is the longest legal onset among the
 * consonants after the previous vowel.
 */
export function arpabetToIpa(phones: Arpabet): string {
  const vowelAt = phones.flatMap((p, i) => (isVowel(p) ? [i] : []));
  const marks = new Map<number, string>();
  if (vowelAt.length > 1) {
    vowelAt.forEach((v, k) => {
      const s = stress(phones[v] as string);
      if (s === 0) return;
      const from = k === 0 ? 0 : (vowelAt[k - 1] as number) + 1;
      let start = v;
      if (k === 0) start = 0;
      else {
        for (let i = from; i < v; i++) {
          if (ONSETS.has(phones.slice(i, v).join(' '))) {
            start = i;
            break;
          }
        }
      }
      marks.set(start, s === 1 ? 'ˈ' : 'ˌ');
    });
  }
  return phones
    .map((p, i) => (marks.get(i) ?? '') + (isVowel(p) ? vowelIpa(p) : consonantIpa(p)))
    .join('');
}

/** `word PH ONES` lines; `word(2)` variants in order; `#` comments dropped. */
export function parseCmudict(text: string): Map<string, Arpabet[]> {
  const dict = new Map<string, Arpabet[]>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [head, ...phones] = line.split(/\s+/);
    if (!head || phones.length === 0) continue;
    const word = head.replace(/\(\d+\)$/, '');
    const list = dict.get(word) ?? [];
    list.push(phones);
    dict.set(word, list);
  }
  return dict;
}

/**
 * The shape of a pronunciation: its syllable count and the syllable of
 * primary stress (a one-syllable word: 0, stressed or not; none: -1).
 */
export function pronunciationShape(phones: Arpabet): { syllables: number; primary: number } {
  const vowels = phones.filter(isVowel);
  if (vowels.length === 1) return { syllables: 1, primary: 0 };
  return { syllables: vowels.length, primary: vowels.findIndex((v) => stress(v) === 1) };
}

const sameShape = (a: Arpabet, b: Arpabet) => {
  const [x, y] = [pronunciationShape(a), pronunciationShape(b)];
  return x.syllables === y.syllables && x.primary === y.primary;
};

/** Reduced vowels: schwa `AH0`, `IH0` and `ER0` (all unstressed by their digit). */
const REDUCED_VOWELS: ReadonlySet<string> = new Set(['AH0', 'IH0', 'ER0']);

export const reducedVowelCount = (phones: Arpabet): number =>
  phones.filter((p) => REDUCED_VOWELS.has(p)).length;

/** The strong form among variants: the fewest reduced vowels, the first on a tie. */
export function strongestVariant(prons: readonly Arpabet[]): Arpabet {
  let best = prons[0] as Arpabet;
  for (const p of prons.slice(1)) if (reducedVowelCount(p) < reducedVowelCount(best)) best = p;
  return best;
}

/**
 * Heteronyms and free variants of the catalogue: [lemmaKey, pos] → the
 * 1-based CMUdict variant (`record(2)` = 2). Not here → null.
 */
export type HeteronymRow = readonly [lemmaKey: string, pos: PartOfSpeechValue, variant: number];

export type IpaLookup = {
  /** The IPA, or null. */
  ipa: string | null;
  /** Why null: not in CMUdict, or variants of different shape and no table row. */
  reason?: 'not_found' | 'ambiguous';
};

/** One word (no spaces): its IPA under the rules above. */
function wordIpa(
  word: string,
  pos: PartOfSpeechValue,
  dict: ReadonlyMap<string, Arpabet[]>,
  table: ReadonlyMap<string, number>,
  lemmaKey: string,
): IpaLookup {
  const prons = dict.get(word);
  if (!prons || prons.length === 0) return { ipa: null, reason: 'not_found' };
  const variant = table.get(`${lemmaKey}\u0000${pos}`);
  if (variant !== undefined) {
    const chosen = prons[variant - 1];
    return chosen ? { ipa: arpabetToIpa(chosen) } : { ipa: null, reason: 'ambiguous' };
  }
  const first = prons[0] as Arpabet;
  if (!prons.every((p) => sameShape(first, p))) return { ipa: null, reason: 'ambiguous' };
  return { ipa: arpabetToIpa(strongestVariant(prons)) };
}

/**
 * The IPA of a catalogue lexeme: the whole lemmaKey if CMUdict has it,
 * otherwise its words (split on spaces and hyphens) joined with a space —
 * null if any word has none.
 */
export function ipaFor(
  lemmaKey: string,
  pos: PartOfSpeechValue,
  dict: ReadonlyMap<string, Arpabet[]>,
  heteronyms: readonly HeteronymRow[],
): IpaLookup {
  const table = new Map(heteronyms.map(([k, p, v]) => [`${k}\u0000${p}`, v]));
  const whole = wordIpa(lemmaKey, pos, dict, table, lemmaKey);
  if (whole.ipa !== null || whole.reason === 'ambiguous') return whole;
  const words = lemmaKey.split(/[\s-]+/u).filter(Boolean);
  if (words.length < 2) return whole;
  const parts = words.map((w) => wordIpa(w, pos, dict, table, lemmaKey));
  const failed = parts.find((p) => p.ipa === null);
  if (failed) return failed;
  return { ipa: parts.map((p) => p.ipa).join(' ') };
}
