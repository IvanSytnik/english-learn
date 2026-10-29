import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lexemeIdentity, loadCefrJDataset } from '../dataset';
import {
  LOCALIZATION_SNAPSHOT_URL,
  type LocalizationSnapshotEntry,
  LocalizationSnapshotSchema,
  loadLocalizationSnapshot,
  matchSnapshot,
  sortSnapshotEntries,
} from '../localization-snapshot';

const entry = (extra: Partial<LocalizationSnapshotEntry> = {}): LocalizationSnapshotEntry => ({
  lemmaKey: 'apple',
  pos: 'NOUN',
  sense: '',
  cefrLevel: 'A1',
  definitions: { en: 'a round fruit' },
  translations: { ru: 'яблоко', uk: 'яблуко', de: 'der Apfel' },
  examples: [
    {
      sentence: 'I eat an apple.',
      clozeTarget: 'apple',
      translation: { ru: 'Я ем яблоко.', uk: 'Я їм яблуко.', de: 'Ich esse einen Apfel.' },
    },
  ],
  collocations: ['apple pie'],
  ...extra,
});

const snapshot = (entries: unknown[]) => ({
  source: 'CEFR-J Wordlist 1.5',
  model: 'claude-haiku-5-5',
  exportedAt: '2026-10-29T12:00:00.000Z',
  entries,
});

describe('LocalizationSnapshotSchema', () => {
  it('accepts a valid snapshot', () => {
    expect(LocalizationSnapshotSchema.safeParse(snapshot([entry()])).success).toBe(true);
  });

  it('rejects a duplicate unique key', () => {
    expect(LocalizationSnapshotSchema.safeParse(snapshot([entry(), entry()])).success).toBe(false);
  });

  it('rejects an example that breaks the cloze rule, or no example at all', () => {
    const [ex] = entry().examples as [LocalizationSnapshotEntry['examples'][number]];
    const broken = entry({ examples: [{ ...ex, clozeTarget: 'pple' }] });
    expect(LocalizationSnapshotSchema.safeParse(snapshot([broken])).success).toBe(false);
    expect(LocalizationSnapshotSchema.safeParse(snapshot([entry({ examples: [] })])).success).toBe(
      false,
    );
  });
});

describe('sortSnapshotEntries', () => {
  it('orders by level, lemmaKey, pos, sense', () => {
    const sorted = sortSnapshotEntries([
      entry({ lemmaKey: 'b', cefrLevel: 'A2' }),
      entry({ lemmaKey: 'b', pos: 'VERB' }),
      entry({ lemmaKey: 'a', sense: 'y' }),
      entry({ lemmaKey: 'a', sense: '' }),
    ]);
    expect(sorted.map((e) => [e.cefrLevel, e.lemmaKey, e.pos, e.sense])).toEqual([
      ['A1', 'a', 'NOUN', ''],
      ['A1', 'a', 'NOUN', 'y'],
      ['A1', 'b', 'VERB', ''],
      ['A2', 'b', 'NOUN', ''],
    ]);
  });
});

describe('matchSnapshot', () => {
  const row = (id: string, extra: Partial<Record<string, string>> = {}) => ({
    id,
    lemmaKey: 'apple',
    pos: 'NOUN',
    sense: '',
    cefrLevel: 'A1',
    ...extra,
  });

  it('matches by [lemmaKey, pos, sense] and maps the entry onto the row id', () => {
    const { matched, missing, levelMismatch } = matchSnapshot(
      [row('x'), row('y', { pos: 'VERB' }), row('z', { sense: 'tree' })],
      [entry(), entry({ pos: 'VERB' })],
    );
    expect(matched.map((m) => m.id)).toEqual(['x', 'y']);
    expect(matched[0]).toEqual({
      id: 'x',
      definitions: entry().definitions,
      translations: entry().translations,
      examples: entry().examples,
      collocations: entry().collocations,
    });
    expect({ missing, levelMismatch }).toEqual({ missing: 1, levelMismatch: 0 });
  });

  it('does not use an entry whose level differs from the row', () => {
    const result = matchSnapshot([row('x', { cefrLevel: 'B1' })], [entry()]);
    expect(result).toEqual({ matched: [], missing: 0, levelMismatch: 1 });
  });
});

describe.skipIf(!existsSync(LOCALIZATION_SNAPSHOT_URL))('the committed snapshot', () => {
  it('parses and covers exactly the CEFR-J dataset, level for level', () => {
    const { entries } = loadLocalizationSnapshot();
    const dataset = new Map(loadCefrJDataset().lexemes.map((l) => [lexemeIdentity(l), l]));
    expect(entries).toHaveLength(dataset.size);
    const offDataset = entries
      .filter((e) => dataset.get(lexemeIdentity(e))?.cefrLevel !== e.cefrLevel)
      .map(lexemeIdentity);
    expect(offDataset).toEqual([]);
    const ids = entries.map(lexemeIdentity);
    expect(sortSnapshotEntries(entries).map(lexemeIdentity)).toEqual(ids);
  });
});
