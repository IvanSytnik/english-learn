import { describe, expect, it } from 'vitest';
import {
  arpabetToIpa,
  ipaFor,
  parseCmudict,
  pronunciationShape,
  reducedVowelCount,
  strongestVariant,
} from '../ipa';
import { buildIpaEntries, ipaOf, loadIpaData } from '../ipa-data';
import { IPA_HETERONYMS } from '../ipa-heteronyms';

const p = (s: string) => s.split(' ');

describe('arpabetToIpa (B6.4a)', () => {
  it.each([
    ['DH AH0', 'ðə'],
    ['B AH0 N AE1 N AH0', 'bəˈnænə'],
    ['AH2 N D ER0 S T AE1 N D', 'ˌʌndɚˈstænd'],
    ['F OW1 T AH0 G R AE2 F', 'ˈfoʊtəˌɡræf'],
    ['K AH0 M P Y UW1 T ER0', 'kəmˈpjutɚ'],
    ['IH1 N S T R AH0 M AH0 N T', 'ˈɪnstrəmənt'],
    ['S T R EH1 NG K TH', 'strɛŋkθ'],
    ['EH1 K S T R AH0', 'ˈɛkstrə'],
    ['B ER1 D', 'bɝd'],
    ['HH AE1 P IY0', 'ˈhæpi'],
    ['M IH1 S T ER0', 'ˈmɪstɚ'],
  ])('%s → %s', (arpabet, ipa) => {
    expect(arpabetToIpa(p(arpabet))).toBe(ipa);
  });

  it('refuses an unknown phone', () => {
    expect(() => arpabetToIpa(p('QQ1'))).toThrow(/Unknown ARPAbet/);
  });
});

const DICT = parseCmudict(
  [
    ';;; comment-less header line is fine',
    'the DH AH0',
    'the(2) DH AH1',
    'the(3) DH IY0',
    'record R AH0 K AO1 R D',
    'record(2) R EH1 K ER0 D',
    'record(3) R IH0 K AO1 R D',
    'data D EY1 T AH0',
    'data(2) D AE1 T AH0',
    'first F ER1 S T # a trailing comment',
    'name N EY1 M',
    'part-time P AA1 R T T AY1 M',
    'part P AA1 R T',
    'time T AY1 M',
    'and AH0 N D',
    'and(2) AE1 N D',
    'to T UW1',
    'to(2) T IH0',
    'to(3) T AH0',
    'use Y UW1 S',
    'use(2) Y UW1 Z',
    'either IY1 DH ER0',
    'either(2) AY1 DH ER0',
  ].join('\n'),
);

describe('parseCmudict and the variant rule', () => {
  it('keeps variants in order and drops comments', () => {
    expect(DICT.get('record')).toHaveLength(3);
    expect(DICT.get('first')).toEqual([p('F ER1 S T')]);
  });

  it('shape: syllable count and the primary-stress syllable; one syllable is always 0', () => {
    expect(pronunciationShape(p('DH AH0'))).toEqual({ syllables: 1, primary: 0 });
    expect(pronunciationShape(p('DH AH1'))).toEqual({ syllables: 1, primary: 0 });
    expect(pronunciationShape(p('R AH0 K AO1 R D'))).toEqual({ syllables: 2, primary: 1 });
    expect(pronunciationShape(p('R EH1 K ER0 D'))).toEqual({ syllables: 2, primary: 0 });
    expect(pronunciationShape(p('AH2 N D ER0'))).toEqual({ syllables: 2, primary: -1 });
  });

  it('reduced vowels are AH0, IH0, ER0; the strong form has the fewest, the first on a tie', () => {
    expect(reducedVowelCount(p('B AH0 N AE1 N AH0'))).toBe(2);
    expect(reducedVowelCount(p('HH AE1 P IY0'))).toBe(0); // IY0 is not reduced
    expect(strongestVariant([p('T UW1'), p('T IH0'), p('T AH0')])).toEqual(p('T UW1'));
    expect(strongestVariant([p('AH0 N D'), p('AE1 N D')])).toEqual(p('AE1 N D'));
    expect(strongestVariant([p('T IH0'), p('T UW1')])).toEqual(p('T UW1'));
    expect(strongestVariant([p('F ER0'), p('F AO1 R')])).toEqual(p('F AO1 R'));
    expect(strongestVariant([p('DH AH0'), p('DH AH1'), p('DH IY0')])).toEqual(p('DH AH1'));
  });

  it('ipaFor (B6.2b): a table row wins; another shape and no row → null; else the strong form', () => {
    const table = [
      ['record', 'NOUN', 2],
      ['record', 'VERB', 3],
      ['use', 'VERB', 2],
    ] as const;
    expect(ipaFor('the', 'OTHER', DICT, table)).toEqual({ ipa: 'ðʌ' });
    expect(ipaFor('and', 'CONJUNCTION', DICT, table)).toEqual({ ipa: 'ænd' });
    expect(ipaFor('to', 'PREPOSITION', DICT, table)).toEqual({ ipa: 'tu' });
    expect(ipaFor('either', 'ADVERB', DICT, table)).toEqual({ ipa: 'ˈiðɚ' }); // tie → first
    expect(ipaFor('data', 'NOUN', DICT, table)).toEqual({ ipa: 'ˈdeɪtə' });
    expect(ipaFor('use', 'VERB', DICT, table)).toEqual({ ipa: 'juz' }); // one shape, the row wins
    expect(ipaFor('use', 'NOUN', DICT, table)).toEqual({ ipa: 'jus' });
    expect(ipaFor('record', 'NOUN', DICT, table)).toEqual({ ipa: 'ˈrɛkɚd' });
    expect(ipaFor('record', 'VERB', DICT, table)).toEqual({ ipa: 'rɪˈkɔrd' });
    expect(ipaFor('record', 'ADJECTIVE', DICT, table)).toEqual({ ipa: null, reason: 'ambiguous' });
    expect(ipaFor('nowhere', 'NOUN', DICT, table)).toEqual({ ipa: null, reason: 'not_found' });
  });

  it('multiword: the whole entry first, else words joined with a space; any word missing → null', () => {
    expect(ipaFor('part-time', 'ADJECTIVE', DICT, [])).toEqual({ ipa: 'ˈpɑrtˈtaɪm' });
    expect(ipaFor('first name', 'NOUN', DICT, [])).toEqual({ ipa: 'fɝst neɪm' });
    expect(ipaFor('first-time', 'ADJECTIVE', DICT, [])).toEqual({ ipa: 'fɝst taɪm' });
    expect(ipaFor('first zork', 'NOUN', DICT, [])).toEqual({ ipa: null, reason: 'not_found' });
    expect(ipaFor('the data', 'NOUN', DICT, [])).toEqual({ ipa: 'ðʌ ˈdeɪtə' });
    expect(ipaFor('the record', 'NOUN', DICT, [])).toEqual({ ipa: null, reason: 'ambiguous' });
  });

  it('entries: one IPA per lemmaKey, by part of speech only where they differ', () => {
    const table = [
      ['record', 'NOUN', 2],
      ['record', 'VERB', 3],
    ] as const;
    const data = buildIpaEntries(
      [
        { lemmaKey: 'record', pos: 'NOUN' },
        { lemmaKey: 'record', pos: 'VERB' },
        { lemmaKey: 'name', pos: 'NOUN' },
        { lemmaKey: 'name', pos: 'VERB' },
        { lemmaKey: 'data', pos: 'NOUN' },
      ],
      DICT,
      table,
    );
    expect(data).toEqual({
      entries: { data: 'ˈdeɪtə', name: 'neɪm' },
      byPos: { record: { NOUN: 'ˈrɛkɚd', VERB: 'rɪˈkɔrd' } },
    });
    expect(ipaOf(data, { lemmaKey: 'record', pos: 'VERB' })).toBe('rɪˈkɔrd');
    expect(ipaOf(data, { lemmaKey: 'record', pos: 'ADJECTIVE' })).toBeUndefined();
    expect(ipaOf(data, { lemmaKey: 'data', pos: 'NOUN' })).toBe('ˈdeɪtə');
    expect(ipaOf(data, { lemmaKey: 'unknown', pos: 'NOUN' })).toBeUndefined();
  });
});

describe('the heteronym table and the committed file', () => {
  it('at most 50 rows, no duplicate [lemmaKey, pos], variants from 1', () => {
    expect(IPA_HETERONYMS.length).toBeLessThanOrEqual(50);
    const keys = IPA_HETERONYMS.map(([k, pos]) => `${k}|${pos}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [, , v] of IPA_HETERONYMS) expect(v).toBeGreaterThanOrEqual(1);
  });

  it('carries the CMUdict licence and the expected pronunciations', () => {
    const data = loadIpaData();
    expect(data.source).toMatchObject({ name: 'CMUdict', licence: 'BSD-2-Clause' });
    expect(data.source.licenceText).toContain('Carnegie Mellon University');
    expect(data.source.licenceText).toContain('Redistributions of source code must retain');
    expect(data.byPos.record).toEqual({ NOUN: 'ˈrɛkɚd', VERB: 'rɪˈkɔrd' });
    expect(data.byPos.live).toEqual({ ADJECTIVE: 'laɪv', VERB: 'lɪv' });
    expect(ipaOf(data, { lemmaKey: 'read', pos: 'VERB' })).toBe('rid');
    expect(ipaOf(data, { lemmaKey: 'computer', pos: 'NOUN' })).toBe('kəmˈpjutɚ');
    expect(ipaOf(data, { lemmaKey: 'apple', pos: 'NOUN' })).toBe('ˈæpəl');
    // B6.2b: strong forms of one shape, table rows for another shape, else null
    expect(ipaOf(data, { lemmaKey: 'and', pos: 'CONJUNCTION' })).toBe('ænd');
    expect(ipaOf(data, { lemmaKey: 'to', pos: 'PREPOSITION' })).toBe('tu');
    expect(ipaOf(data, { lemmaKey: 'for', pos: 'PREPOSITION' })).toBe('fɔr');
    expect(ipaOf(data, { lemmaKey: 'appropriate', pos: 'ADJECTIVE' })).toBe('əˈproʊpriət');
    expect(ipaOf(data, { lemmaKey: 'subject', pos: 'NOUN' })).toBe('ˈsʌbdʒɪkt');
    expect(ipaOf(data, { lemmaKey: 'object', pos: 'NOUN' })).toBeNull();
    const values = [
      ...Object.values(data.entries),
      ...Object.values(data.byPos).flatMap((m) => Object.values(m)),
    ];
    expect(values.filter((v) => v !== null).length / values.length).toBeGreaterThan(0.9);
  });
});
