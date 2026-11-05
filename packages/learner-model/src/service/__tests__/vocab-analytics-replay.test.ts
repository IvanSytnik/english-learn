import { type ItemAttemptedPayload, ItemAttemptedPayloadSchema } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { applyItemAttempted } from '../apply';
import { replayUser } from '../replay';
import { createMemoryDb } from './memory-db';

/**
 * B6.1: `variant`, `chosenItemId`, `answerText` and `locale` are analytics,
 * never folded. A stream with them and the same stream without them must
 * rebuild byte-identical projections — history written before B6.1 and
 * history written after it mean the same learner state.
 */

const USER = 'user_1';
const T0 = 1_750_000_000_000n;
const HOUR = 3_600_000n;
const APPLE = 'item.vocab.apple';
const PEAR = 'item.vocab.pear';
const GRAMMAR = 'item.past_simple.regular_ed';

const vocab = (itemId: string) => ({
  itemId,
  conceptId: 'vocab.food_drink.a1',
  timeMs: 1800,
  irt: { a: 1, b: 0 },
});

/** [the payload as written before B6.1, the analytics B6.1 adds to it] */
const STREAM: [ItemAttemptedPayload, Partial<ItemAttemptedPayload>][] = [
  [
    { ...vocab(APPLE), correct: false, rating: 'AGAIN', mode: 'recognition' },
    { variant: 'en_to_l1', chosenItemId: PEAR, locale: 'ru' },
  ],
  [
    { ...vocab(PEAR), correct: true, rating: 'GOOD', mode: 'recognition' },
    { variant: 'l1_to_en', locale: 'ru' },
  ],
  [
    {
      itemId: GRAMMAR,
      conceptId: 'past_simple',
      correct: true,
      timeMs: 4200,
      rating: 'GOOD',
      irt: { a: 1.3, b: -0.5 },
    },
    {},
  ],
  [
    { ...vocab(APPLE), correct: true, rating: 'GOOD', mode: 'recognition' },
    // A cloze that fell back to l1_to_en: recorded as what was shown.
    { variant: 'l1_to_en', locale: 'ru' },
  ],
  [
    { ...vocab(APPLE), correct: false, rating: 'AGAIN', mode: 'cloze' },
    { variant: 'cloze', chosenItemId: PEAR, locale: 'uk' },
  ],
  [
    { ...vocab(PEAR), correct: false, rating: 'AGAIN', mode: 'recall', dontKnow: true },
    { variant: 'full_recall', locale: 'de' },
  ],
  [
    { ...vocab(PEAR), correct: true, rating: 'HARD', mode: 'recall', hinted: true },
    { variant: 'full_recall', answerText: 'pear', locale: 'de' },
  ],
  [
    { ...vocab(APPLE), correct: false, rating: 'AGAIN', mode: 'recall' },
    { variant: 'cued_recall', answerText: 'appel', locale: 'en' },
  ],
  [
    { ...vocab('item.vocab.plum'), correct: true, rating: 'EASY', mode: 'recall', proof: true },
    { variant: 'cued_recall', answerText: 'plum', locale: 'ru' },
  ],
];

const withAnalytics = STREAM.map(([before, added]) =>
  ItemAttemptedPayloadSchema.parse({ ...before, ...added }),
);
const withoutAnalytics = STREAM.map(([before]) => ItemAttemptedPayloadSchema.parse(before));

/** Projections as one string: bigints spelled out, keys in insertion order. */
const snapshot = (memory: ReturnType<typeof createMemoryDb>) =>
  JSON.stringify(
    {
      masteries: [...memory.masteries.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
      reviews: [...memory.reviews.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
    },
    (_, v) => (typeof v === 'bigint' ? `${v}n` : v),
  );

async function replayed(payloads: ItemAttemptedPayload[]) {
  const memory = createMemoryDb();
  for (const [i, payload] of payloads.entries()) {
    await memory.tx.appendEvent({
      userId: USER,
      type: 'ITEM_ATTEMPTED',
      occurredAt: T0 + BigInt(i) * HOUR,
      payload,
      idempotencyKey: null,
    });
  }
  const result = await replayUser(memory.db, USER);
  return { memory, result };
}

describe('B6.1 analytics fields are never folded', () => {
  it('the test stream really carries every new field', () => {
    const keys = new Set(withAnalytics.flatMap((p) => Object.keys(p)));
    for (const field of ['variant', 'chosenItemId', 'answerText', 'locale']) {
      expect(keys, field).toContain(field);
    }
    expect(withoutAnalytics.flatMap((p) => Object.keys(p))).not.toContain('variant');
  });

  it('replay with and without them yields byte-identical projections', async () => {
    const a = await replayed(withAnalytics);
    const b = await replayed(withoutAnalytics);
    expect(a.result).toEqual(b.result);
    expect(a.memory.reviews.size).toBe(4);
    expect(snapshot(a.memory)).toBe(snapshot(b.memory));
  });

  it('B6.5 variant ids (schema-first) fold like the rung they replace', async () => {
    const renamed: Partial<Record<string, string>> = {
      en_to_l1: 'audio_to_l1',
      l1_to_en: 'definition_to_en',
      cloze: 'collocation',
      cued_recall: 'dictation',
      full_recall: 'level_up',
    };
    const later = withAnalytics.map((p) => {
      const variant = p.variant && !p.proof ? renamed[p.variant] : p.variant;
      const mode = p.variant === 'full_recall' && !p.proof ? 'cloze' : p.mode;
      const { answerText: _, ...rest } = p;
      return ItemAttemptedPayloadSchema.parse({
        ...(variant === 'level_up' ? rest : p),
        variant,
        mode,
      });
    });
    expect(new Set(later.map((p) => p.variant))).toEqual(
      new Set([
        'audio_to_l1',
        'definition_to_en',
        'collocation',
        'dictation',
        'level_up',
        'cued_recall',
        undefined,
      ]),
    );
    const plain = withoutAnalytics.map((p, i) =>
      later[i]?.mode === p.mode
        ? p
        : ItemAttemptedPayloadSchema.parse({ ...p, mode: later[i]?.mode }),
    );
    const a = await replayed(later);
    const b = await replayed(plain);
    expect(snapshot(a.memory)).toBe(snapshot(b.memory));
  });

  it('one fold step ignores them too, whatever the prior state', () => {
    let prev = { bkt: null, fsrs: null, stage: null } as Parameters<typeof applyItemAttempted>[0];
    for (const [i, payload] of withAnalytics.entries()) {
      const at = T0 + BigInt(i) * HOUR;
      const folded = applyItemAttempted(prev, payload, at);
      const plain = applyItemAttempted(prev, withoutAnalytics[i] as ItemAttemptedPayload, at);
      expect(folded).toEqual(plain);
      prev = folded;
    }
  });
});
