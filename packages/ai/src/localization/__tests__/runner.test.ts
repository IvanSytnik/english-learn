import type { LexemeLocalization } from '@englishlearn/db/queries/lexeme-localization';
import { describe, expect, it, vi } from 'vitest';
import { type LocalizationCaller, LocalizationChunkError, LocalizationFatalError } from '../client';
import { type PendingRow, planLocalization, runLocalization } from '../runner';
import type { LocalizationRequestItem, WireLocalizationItem } from '../types';

const row = (n: number, extra: Partial<PendingRow> = {}): PendingRow => ({
  id: `id-${n}`,
  lemma: `word${n}`,
  lemmaKey: `word${n}`,
  pos: 'VERB',
  sense: '',
  cefrLevel: 'A1',
  ...extra,
});

/** A valid wire answer for a request item. */
const answer = (item: LocalizationRequestItem): WireLocalizationItem => ({
  key: item.key,
  lemma: item.lemma,
  definitionEn: 'to do something',
  translations: { ru: 'делать', uk: 'робити', de: 'machen' },
  examples: [
    {
      sentence: `They ${item.lemma} it.`,
      clozeTarget: item.lemma,
      translation: { ru: 'Они делают это.', uk: 'Вони роблять це.', de: 'Sie machen es.' },
    },
  ],
  collocations: [],
});

const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 1, cacheWriteTokens: 2 };
const echo: LocalizationCaller = async (items) => ({ data: { items: items.map(answer) }, usage });

const store = (rows: PendingRow[]) => {
  const written: LexemeLocalization[][] = [];
  return {
    written,
    findPending: async () => rows,
    apply: async (chunk: LexemeLocalization[]) => {
      written.push(chunk);
      return chunk.length;
    },
  };
};

const topicOf = (r: PendingRow) => (r.lemma === 'word2' ? 'food_drink' : undefined);

describe('planLocalization', () => {
  it('chunks, keys "1".."N" per chunk, falls back to the general topic', () => {
    const plan = planLocalization([row(1), row(2), row(3)], { topicOf, batchSize: 2 });
    expect(plan.selected).toBe(3);
    expect(plan.chunks.map((c) => c.map((i) => [i.key, i.id, i.topic]))).toEqual([
      [
        ['1', 'id-1', 'general'],
        ['2', 'id-2', 'food_drink'],
      ],
      [['1', 'id-3', 'general']],
    ]);
  });

  it('filters by topic before applying the limit', () => {
    const plan = planLocalization([row(1), row(2), row(3)], {
      topicOf,
      topic: 'food_drink',
      limit: 1,
    });
    expect(plan.chunks.flat().map((i) => i.id)).toEqual(['id-2']);
  });
});

describe('runLocalization', () => {
  it('writes every valid item, one apply per chunk, and sums the usage', async () => {
    const s = store([row(1), row(2), row(3)]);
    const report = await runLocalization({ store: s, call: echo, topicOf, batchSize: 2 });
    expect(report).toEqual({
      pending: 3,
      selected: 3,
      chunks: 2,
      written: 3,
      rejected: 0,
      failedChunks: 0,
      usage: { inputTokens: 20, outputTokens: 10, cacheReadTokens: 2, cacheWriteTokens: 4 },
    });
    expect(s.written.map((c) => c.map((l) => l.id))).toEqual([['id-1', 'id-2'], ['id-3']]);
  });

  it('dead-letters the invalid items of a chunk and writes the rest', async () => {
    const s = store([row(1), row(2)]);
    const onRejected = vi.fn();
    const call: LocalizationCaller = async (items) => ({
      data: {
        items: items.map((i) => (i.key === '2' ? { ...answer(i), examples: [] } : answer(i))),
      },
      usage,
    });
    const report = await runLocalization({ store: s, call, topicOf, onRejected });
    expect(report).toMatchObject({ written: 1, rejected: 1 });
    expect(onRejected).toHaveBeenCalledWith([
      { id: 'id-2', lemma: 'word2', reasons: [expect.stringMatching(/^examples:/)] },
    ]);
  });

  it('dead-letters a failed chunk and goes on with the next', async () => {
    const s = store([row(1), row(2), row(3)]);
    const onRejected = vi.fn();
    let calls = 0;
    const call: LocalizationCaller = async (items) => {
      calls += 1;
      if (calls === 1) throw new LocalizationChunkError('stop_reason max_tokens');
      return echo(items);
    };
    const report = await runLocalization({
      store: s,
      call,
      topicOf,
      batchSize: 2,
      concurrency: 1,
      onRejected,
    });
    expect(report).toMatchObject({ written: 1, rejected: 2, failedChunks: 1 });
    expect(onRejected.mock.calls[0]?.[0]).toEqual([
      { id: 'id-1', lemma: 'word1', reasons: ['stop_reason max_tokens'] },
      { id: 'id-2', lemma: 'word2', reasons: ['stop_reason max_tokens'] },
    ]);
  });

  it('stops taking chunks after a fatal error, while other workers are busy', async () => {
    let calls = 0;
    const call: LocalizationCaller = async (items) => {
      calls += 1;
      if (calls === 1) throw new LocalizationFatalError('Anthropic API 401');
      await new Promise((r) => setTimeout(r, 10));
      return echo(items);
    };
    const rows = Array.from({ length: 10 }, (_, i) => row(i + 1));
    await expect(
      runLocalization({ store: store(rows), call, topicOf, batchSize: 1, concurrency: 2 }),
    ).rejects.toThrow(LocalizationFatalError);
    // Let the busy worker finish its chunk: it must not start another one.
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(2);
  });

  it('runs at most `concurrency` calls at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const call: LocalizationCaller = async (items) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return echo(items);
    };
    const rows = Array.from({ length: 9 }, (_, i) => row(i + 1));
    await runLocalization({ store: store(rows), call, topicOf, batchSize: 1, concurrency: 3 });
    expect(peak).toBe(3);
  });

  it.each([0, 51, 1.5])('rejects batchSize %s', async (batchSize) => {
    await expect(
      runLocalization({ store: store([]), call: echo, topicOf, batchSize }),
    ).rejects.toThrow(/batchSize/);
  });
});
