/**
 * The contraction table generator (B6.7c, V2-20 part 1): stems × suffixes by
 * rule, kept only when every word of the expansion is one of the 80 excluded
 * function words or a catalogue lemma. Pure: scripts/build-contractions.ts
 * feeds it the committed data and writes data/contractions.json; the test
 * runs it on the same data and compares byte for byte.
 *
 * Rules (a closed grammar, not a cross product — `the'll`, `let'll`, `i're`
 * are never made):
 * - negation `n't`: every finite auxiliary and one-word modal among the 80,
 *   by their source tags (be-/do-/have-verb, modal auxiliary), except `am`
 *   (`ain't` is explicit) and `may` (`mayn't` is archaic); `can't`, `won't`,
 *   `shan't` are spelled by table;
 * - subject clitics `'m 're 's 've 'll 'd` (am, are, is, have, will, would)
 *   after a subject that agrees: `'m` only after `i`; `'re` and `'ve` not
 *   after a third-person singular (`he`, `she`, `it`, `that`); `here` takes
 *   only the presentative `'s`; wh-words and `there` take all six;
 * - the modal perfect `'ve` after could, would, should, might, must;
 * - `let's` (let us); explicit `cannot`, `ain't`, `y'all`.
 * One suffix per form: double contractions (`i'd've`, `couldn't've`) are
 * never made.
 */

export const CONTRACTION_SUFFIXES = ["n't", "'ll", "'d", "'ve", "'re", "'m", "'s"] as const;
export type ContractionSuffix = (typeof CONTRACTION_SUFFIXES)[number];

type Agreement = 'first-singular' | 'second' | 'plural' | 'third-singular' | 'any' | 'here';

/** Personal pronouns (subject case), wh-words, that / there / here (B6-SPEC V2-20). */
export const CONTRACTION_SUBJECTS: Readonly<Record<string, Agreement>> = {
  i: 'first-singular',
  you: 'second',
  we: 'plural',
  they: 'plural',
  he: 'third-singular',
  she: 'third-singular',
  it: 'third-singular',
  that: 'third-singular',
  there: 'any',
  what: 'any',
  who: 'any',
  where: 'any',
  when: 'any',
  why: 'any',
  how: 'any',
  here: 'here',
};

const CLITICS: Readonly<
  Record<Exclude<ContractionSuffix, "n't">, { stands: string; after: readonly Agreement[] }>
> = {
  "'m": { stands: 'am', after: ['first-singular'] },
  "'re": { stands: 'are', after: ['second', 'plural', 'any'] },
  "'s": { stands: 'is', after: ['third-singular', 'any', 'here'] },
  "'ve": { stands: 'have', after: ['first-singular', 'second', 'plural', 'any'] },
  "'ll": {
    stands: 'will',
    after: ['first-singular', 'second', 'plural', 'third-singular', 'any'],
  },
  "'d": {
    stands: 'would',
    after: ['first-singular', 'second', 'plural', 'third-singular', 'any'],
  },
};

/** Source tags whose finite forms take `n't`. */
const NEGATED_TAGS = ['be-verb', 'do-verb', 'have-verb', 'modal auxiliary'] as const;
/** Forms of those tags that never take `n't`: non-finite, clitics, and the two by decision. */
const NOT_NEGATED: Readonly<Record<string, string>> = {
  be: 'non-finite',
  been: 'non-finite',
  being: 'non-finite',
  doing: 'non-finite',
  done: 'non-finite',
  having: 'non-finite',
  am: '`amn’t` is not standard; `ain’t` is explicit',
  may: '`mayn’t` is archaic (B6.7b)',
};
const IRREGULAR_NEGATION: Readonly<Record<string, string>> = {
  can: "can't",
  will: "won't",
  shall: "shan't",
};
/** Modals whose perfect is contracted (`could've` = could have). */
export const PERFECT_MODALS = ['could', 'would', 'should', 'might', 'must'] as const;

const EXPLICIT: Readonly<Record<string, readonly string[]>> = {
  cannot: ['can', 'not'],
  "ain't": ['am', 'not'],
  "y'all": ['you', 'all'],
};

export type ContractionInputs = {
  /** EXCLUDED_BY_POS: the 80 function words by source tag. */
  excludedByPos: Readonly<Record<string, readonly string[]>>;
  /** lemmaKeys of the catalogue (the committed CEFR-J dataset). */
  catalogueKeys: ReadonlySet<string>;
  /** Catalogue lemmas and variants, normalized like a pasted term: a key here is a word, not a contraction. */
  catalogueSpellings: ReadonlySet<string>;
};

export type ContractionKind = 'negation' | 'subject' | 'modal-perfect' | 'let' | 'explicit';

export type ContractionTable = {
  /** Contraction → the words it stands for, sorted by contraction. */
  contractions: Record<string, string[]>;
  counts: Record<ContractionKind | 'total', number>;
  /** Made by a rule but left out: an expansion word unknown, or the key is a catalogue word. */
  dropped: { key: string; reason: string }[];
};

export function buildContractionTable(inputs: ContractionInputs): ContractionTable {
  const functionWords = new Set(Object.values(inputs.excludedByPos).flat());
  const known = (w: string) => functionWords.has(w) || inputs.catalogueKeys.has(w);
  const made: { key: string; words: string[]; kind: ContractionKind }[] = [];

  for (const tag of NEGATED_TAGS) {
    const forms = inputs.excludedByPos[tag];
    if (!forms) throw new Error(`excluded headwords: no tag ${tag}`);
    for (const form of forms) {
      if (form.includes(' ') || form.startsWith("'") || Object.hasOwn(NOT_NEGATED, form)) continue;
      made.push({
        key: IRREGULAR_NEGATION[form] ?? `${form}n't`,
        words: [form, 'not'],
        kind: 'negation',
      });
    }
  }
  for (const [subject, agreement] of Object.entries(CONTRACTION_SUBJECTS)) {
    for (const [suffix, clitic] of Object.entries(CLITICS)) {
      if (!clitic.after.includes(agreement)) continue;
      made.push({ key: `${subject}${suffix}`, words: [subject, clitic.stands], kind: 'subject' });
    }
  }
  const modals = new Set(inputs.excludedByPos['modal auxiliary'] ?? []);
  for (const modal of PERFECT_MODALS) {
    if (!modals.has(modal)) throw new Error(`perfect modal ${modal} is not a modal auxiliary`);
    made.push({ key: `${modal}'ve`, words: [modal, 'have'], kind: 'modal-perfect' });
  }
  made.push({ key: "let's", words: ['let', 'us'], kind: 'let' });
  for (const [key, words] of Object.entries(EXPLICIT)) {
    made.push({ key, words: [...words], kind: 'explicit' });
  }

  const kept: typeof made = [];
  const dropped: ContractionTable['dropped'] = [];
  const seen = new Set<string>();
  for (const m of made) {
    if (seen.has(m.key)) throw new Error(`contraction made twice: ${m.key}`);
    seen.add(m.key);
    const unknown = m.words.filter((w) => !known(w));
    if (unknown.length > 0) dropped.push({ key: m.key, reason: `unknown ${unknown.join(', ')}` });
    else if (inputs.catalogueSpellings.has(m.key))
      dropped.push({ key: m.key, reason: 'a catalogue word' });
    else kept.push(m);
  }
  kept.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const counts: ContractionTable['counts'] = {
    total: kept.length,
    negation: 0,
    subject: 0,
    'modal-perfect': 0,
    let: 0,
    explicit: 0,
  };
  for (const m of kept) counts[m.kind] += 1;
  return {
    contractions: Object.fromEntries(kept.map((m) => [m.key, m.words])),
    counts,
    dropped,
  };
}

export const CONTRACTIONS_NOTE =
  "Paste import (B6.7b V2-19 #41, B6.7c V2-20): contractions of function words, shown in the function-words group, never 'not found'; B6.10 rejects an entry before any LLM call. Rules: n't after every finite auxiliary and one-word modal of the 80 excluded headwords (not am, not may); 'm 're 's 've 'll 'd after subject pronouns, wh-words, that and there by agreement ('s only after here); 've after could, would, should, might, must; let's; explicit cannot, ain't, y'all. Kept only when every expansion word is an excluded headword or a catalogue word. Keys normalized like pasted text; the catalogue is matched first.";
export const CONTRACTIONS_SOURCE =
  'Generated by packages/learner-model/scripts/build-contractions.ts (rules: src/vocab/import/contraction-table.ts) from packages/db/data/cefr-j-v1.5-excluded.json and packages/db/data/cefr-j-v1.5.json. Do not edit by hand.';
export const CONTRACTIONS_REGENERATE =
  'pnpm --filter @englishlearn/learner-model build:contractions';

/**
 * The committed file: the header, then one contraction per line (pitfall
 * 232: `JSON.stringify(…, 2)` would put every word on its own line, and
 * packages/*\/data is outside biome).
 */
export function formatContractionTable(table: ContractionTable): string {
  const q = (v: unknown) => JSON.stringify(v);
  const entries = Object.entries(table.contractions).map(
    ([key, words]) => `    ${q(key)}: [${words.map(q).join(', ')}]`,
  );
  return [
    '{',
    `  "note": ${q(CONTRACTIONS_NOTE)},`,
    `  "source": ${q(CONTRACTIONS_SOURCE)},`,
    `  "regenerate": ${q(CONTRACTIONS_REGENERATE)},`,
    `  "counts": ${q(table.counts).replaceAll(',"', ', "').replaceAll('":', '": ')},`,
    '  "contractions": {',
    entries.join(',\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}
