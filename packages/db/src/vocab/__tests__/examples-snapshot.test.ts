import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lexemeIdentity } from '../dataset';
import {
  EXAMPLE_MAX_WORDS,
  EXAMPLE_MIN_WORDS,
  exampleWords,
  normalizeSentence,
} from '../example-checks';
import {
  EXAMPLES_SNAPSHOT_URL,
  type ExamplesSnapshot,
  ExamplesSnapshotSchema,
  loadExamplesSnapshot,
  serializeExamplesSnapshot,
} from '../examples-snapshot';
import { loadLocalizationSnapshot } from '../localization-snapshot';

const ex = (sentence: string, clozeTarget: string) => ({
  sentence,
  clozeTarget,
  translation: { ru: 'р', uk: 'у', de: 'd' },
});
const entry = (lemmaKey: string, pos = 'NOUN') => ({
  lemmaKey,
  pos,
  sense: '',
  base: `A ${lemmaKey} here.`,
  examples: [
    ex(`One ${lemmaKey} is here today.`, lemmaKey),
    ex(`Two ${lemmaKey}s are here.`, `${lemmaKey}s`),
  ],
});
const snapshot = (entries: unknown[]): unknown => ({
  source: {
    job: 'examples',
    model: 'claude-haiku-5-5',
    prompt: 'v1',
    updatedAt: '2026-11-03T12:00:00.000Z',
    usage: { inputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
  },
  entries,
});

describe('examples snapshot (B6.4a)', () => {
  it('accepts exactly two examples per entry, each a valid cloze in all three languages', () => {
    expect(ExamplesSnapshotSchema.safeParse(snapshot([entry('cat')])).success).toBe(true);
    const one = { ...entry('cat'), examples: [ex('One cat is here today.', 'cat')] };
    expect(ExamplesSnapshotSchema.safeParse(snapshot([one])).success).toBe(false);
    const twice = {
      ...entry('cat'),
      examples: [ex('A cat and a cat sit.', 'cat'), ex('Cats sit.', 'Cats')],
    };
    expect(ExamplesSnapshotSchema.safeParse(snapshot([twice])).success).toBe(false);
    const noUk = {
      ...entry('cat'),
      examples: [
        { ...ex('One cat is here.', 'cat'), translation: { ru: 'р', de: 'd' } },
        ex('Cats sit.', 'Cats'),
      ],
    };
    expect(ExamplesSnapshotSchema.safeParse(snapshot([noUk])).success).toBe(false);
  });

  it('refuses a duplicate key; serializes one entry per line in key order', () => {
    expect(ExamplesSnapshotSchema.safeParse(snapshot([entry('cat'), entry('cat')])).success).toBe(
      false,
    );
    const s = ExamplesSnapshotSchema.parse(
      snapshot([entry('dog'), entry('cat', 'VERB'), entry('cat')]),
    ) as ExamplesSnapshot;
    const text = serializeExamplesSnapshot(s);
    const lines = text.split('\n').filter((l) => l.startsWith('    {'));
    expect(lines.map((l) => JSON.parse(l.replace(/,$/, '')).lemmaKey)).toEqual([
      'cat',
      'cat',
      'dog',
    ]);
    expect(lines.map((l) => JSON.parse(l.replace(/,$/, '')).pos)).toEqual(['NOUN', 'VERB', 'NOUN']);
    const back = ExamplesSnapshotSchema.parse(JSON.parse(text));
    expect(back.source).toEqual(s.source);
    expect(new Set(back.entries.map((e) => JSON.stringify(e)))).toEqual(
      new Set(s.entries.map((e) => JSON.stringify(e))),
    );
  });
});

describe('the committed examples snapshot', () => {
  const snapshot = loadExamplesSnapshot();
  const localized = new Map(loadLocalizationSnapshot().entries.map((e) => [lexemeIdentity(e), e]));

  it('is serialized canonically, so a re-run diff shows only what changed', () => {
    expect(readFileSync(EXAMPLES_SNAPSHOT_URL, 'utf8')).toBe(serializeExamplesSnapshot(snapshot));
  });

  it('extends a published lexeme on its current first example, with two new sentences', () => {
    for (const e of snapshot.entries) {
      const l = localized.get(lexemeIdentity(e));
      expect(l, `${e.lemmaKey} ${e.pos}`).toBeDefined();
      expect(e.base).toBe(l?.examples[0]?.sentence);
      const existing = new Set(l?.examples.map((x) => normalizeSentence(x.sentence)));
      const fresh = e.examples.map((x) => normalizeSentence(x.sentence));
      expect(new Set(fresh).size).toBe(2);
      for (const [i, x] of e.examples.entries()) {
        expect(existing.has(fresh[i] as string)).toBe(false);
        const n = exampleWords(x.sentence).length;
        expect(n >= EXAMPLE_MIN_WORDS && n <= EXAMPLE_MAX_WORDS, x.sentence).toBe(true);
      }
    }
  });
});
