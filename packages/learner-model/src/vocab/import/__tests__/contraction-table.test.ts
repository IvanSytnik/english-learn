import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRACTIONS_URL, loadContractionInputs } from '../../../../scripts/build-contractions';
import {
  buildContractionTable,
  CONTRACTION_SUFFIXES,
  formatContractionTable,
} from '../contraction-table';
import { CONTRACTIONS } from '../contractions';

/**
 * The generated contraction table (B6.7c, V2-20): every input is committed,
 * so the committed file must be the generator's output byte for byte; it
 * holds the whole B6.7b table; no rule makes a form that does not exist.
 */

const INPUTS = loadContractionInputs();
const TABLE = buildContractionTable(INPUTS);

/** The B6.7b table (`9fe99ae`, 49 entries), copied from that file by script: kept entire, unchanged. */
const B6_7B: [string, string[]][] = [
  ["aren't", ['are', 'not']],
  ["can't", ['can', 'not']],
  ['cannot', ['can', 'not']],
  ["couldn't", ['could', 'not']],
  ["didn't", ['did', 'not']],
  ["doesn't", ['does', 'not']],
  ["don't", ['do', 'not']],
  ["hadn't", ['had', 'not']],
  ["hasn't", ['has', 'not']],
  ["haven't", ['have', 'not']],
  ["he'd", ['he', 'would']],
  ["he'll", ['he', 'will']],
  ["he's", ['he', 'is']],
  ["i'd", ['i', 'would']],
  ["i'll", ['i', 'will']],
  ["i'm", ['i', 'am']],
  ["i've", ['i', 'have']],
  ["isn't", ['is', 'not']],
  ["it'd", ['it', 'would']],
  ["it'll", ['it', 'will']],
  ["it's", ['it', 'is']],
  ["let's", ['let', 'us']],
  ["mightn't", ['might', 'not']],
  ["mustn't", ['must', 'not']],
  ["needn't", ['need', 'not']],
  ["shan't", ['shall', 'not']],
  ["she'd", ['she', 'would']],
  ["she'll", ['she', 'will']],
  ["she's", ['she', 'is']],
  ["shouldn't", ['should', 'not']],
  ["that's", ['that', 'is']],
  ["there's", ['there', 'is']],
  ["they'd", ['they', 'would']],
  ["they'll", ['they', 'will']],
  ["they're", ['they', 'are']],
  ["they've", ['they', 'have']],
  ["wasn't", ['was', 'not']],
  ["we'd", ['we', 'would']],
  ["we'll", ['we', 'will']],
  ["we're", ['we', 'are']],
  ["we've", ['we', 'have']],
  ["weren't", ['were', 'not']],
  ["what's", ['what', 'is']],
  ["won't", ['will', 'not']],
  ["wouldn't", ['would', 'not']],
  ["you'd", ['you', 'would']],
  ["you'll", ['you', 'will']],
  ["you're", ['you', 'are']],
  ["you've", ['you', 'have']],
];

/** #43: the forms B6.7b left in "not found". */
const ISSUE_43 = ["that'll", "there'll", "who'll", "what're", "who'd", "y'all", "ain't"];

/** Forms that do not exist, or double contractions: no rule may make them. */
const NEVER = [
  "i'd've",
  "couldn't've",
  "let'll",
  "let'd",
  "i're",
  "he'm",
  "we'm",
  "he've",
  "the'll",
  "my've",
];

describe('the generated contraction table (V2-20)', () => {
  it('the committed file is the generator’s output, byte for byte (build:contractions)', () => {
    expect(readFileSync(CONTRACTIONS_URL, 'utf8')).toBe(formatContractionTable(TABLE));
    expect(Object.fromEntries(CONTRACTIONS)).toEqual(TABLE.contractions);
  });

  it('holds the B6.7b table entire, each entry with the same expansion', () => {
    expect(B6_7B.length).toBe(49);
    const lost = B6_7B.filter(([key, words]) => {
      const now = CONTRACTIONS.get(key);
      return now === undefined || now.join(' ') !== words.join(' ');
    });
    expect(lost).toEqual([]);
  });

  it('holds the #43 forms, 92 entries in all, by kind', () => {
    for (const c of ISSUE_43) expect(CONTRACTIONS.has(c), c).toBe(true);
    expect(TABLE.counts).toEqual({
      total: 92,
      negation: 19,
      subject: 64,
      'modal-perfect': 5,
      let: 1,
      explicit: 3,
    });
    expect(CONTRACTIONS.size).toBe(92);
  });

  it('never makes a form that does not exist, nor a double contraction', () => {
    for (const form of NEVER) expect(CONTRACTIONS.has(form), form).toBe(false);
    const explicit = new Set(['cannot', "ain't", "y'all"]);
    for (const key of CONTRACTIONS.keys()) {
      if (explicit.has(key)) continue;
      expect(key.split("'").length, key).toBe(2);
      expect(
        CONTRACTION_SUFFIXES.filter((s) => key.endsWith(s)),
        key,
      ).toHaveLength(1);
    }
  });

  it('keeps a combination only when every expansion word is known; a catalogue word is no contraction', () => {
    const withoutHow = buildContractionTable({
      ...INPUTS,
      catalogueKeys: new Set([...INPUTS.catalogueKeys].filter((k) => k !== 'how')),
    });
    expect(Object.keys(withoutHow.contractions).filter((k) => k.startsWith('how'))).toEqual([]);
    expect(withoutHow.dropped).toEqual(
      ["how're", "how's", "how've", "how'll", "how'd"].map((key) => ({
        key,
        reason: 'unknown how',
      })),
    );
    const spelled = buildContractionTable({
      ...INPUTS,
      catalogueSpellings: new Set([...INPUTS.catalogueSpellings, "y'all"]),
    });
    expect(spelled.contractions["y'all"]).toBeUndefined();
    expect(spelled.dropped).toEqual([{ key: "y'all", reason: 'a catalogue word' }]);
    // On the committed data nothing is dropped.
    expect(TABLE.dropped).toEqual([]);
  });
});
