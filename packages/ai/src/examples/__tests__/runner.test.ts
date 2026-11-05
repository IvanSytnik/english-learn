import { describe, expect, it } from 'vitest';
import { LocalizationChunkError, LocalizationFatalError } from '../../localization/client';
import { buildExamplesRequest, EXAMPLES_SYSTEM_PROMPT } from '../prompt';
import { type ExamplesSource, estimateCostUsd, planExamples, runExamples } from '../runner';

const T = { ru: 'Это пример.', uk: 'Це приклад.', de: 'Das ist ein Beispiel.' };
const source = (lemma: string, cefrLevel: 'A1' | 'A2' = 'A1'): ExamplesSource => ({
  lemmaKey: lemma,
  lemma,
  pos: 'PREPOSITION',
  sense: '',
  cefrLevel,
  topic: 'general',
  meaning: 'm',
  examples: [{ sentence: `A ${lemma} b.`, clozeTarget: lemma, translation: T }],
});
const usage = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 };
const good = (lemma: string) => [
  { sentence: `The book is ${lemma} the table now.`, clozeTarget: lemma, translation: T },
  { sentence: `We sat ${lemma} a big old tree.`, clozeTarget: lemma, translation: T },
];

describe('planExamples', () => {
  it('skips what the snapshot has, filters by level, caps, keys 1..N per chunk', () => {
    const sources = ['in', 'on', 'at', 'by', 'up'].map((l, i) => source(l, i % 2 ? 'A2' : 'A1'));
    const plan = planExamples(sources, {
      done: new Set([`on\u0000PREPOSITION\u0000`]),
      level: 'A1',
      batchSize: 2,
    });
    expect(plan.pending).toBe(4);
    expect(plan.selected).toBe(3); // in, at, up
    expect(plan.chunks.map((c) => c.map((p) => `${p.key}:${p.lemma}`))).toEqual([
      ['1:in', '2:at'],
      ['1:up'],
    ]);
    expect(plan.chunks[0]?.[0]).toMatchObject({
      existing: ['A in b.'],
      existingForm: 'in',
      existingPlace: 'middle',
      vary: false,
      base: 'A in b.',
    });
    expect(planExamples(sources, { done: new Set(), limit: 2 }).selected).toBe(2);
  });

  it('tells the model where examples[0] has the word and whether it must vary', () => {
    const verb = (sentence: string, clozeTarget: string): ExamplesSource => ({
      ...source('run'),
      pos: 'VERB',
      examples: [{ sentence, clozeTarget, translation: T }],
    });
    const items = [
      verb('Run to the door now.', 'Run'),
      verb('I like to run.', 'run'),
      verb('I run every day.', 'run'),
    ].map((s) => planExamples([s], { done: new Set() }).chunks[0]?.[0]);
    expect(items.map((i) => [i?.existingPlace, i?.vary])).toEqual([
      ['start', true],
      ['end', true],
      ['middle', true],
    ]);
    expect(planExamples([source('in')], { done: new Set() }).chunks[0]?.[0]?.vary).toBe(false);
  });
});

describe('runExamples', () => {
  it('validates per chunk, hands accepted and rejected to onChunk, sums usage', async () => {
    const plan = planExamples([source('in'), source('on')], { done: new Set(), batchSize: 1 });
    const seen: string[] = [];
    const report = await runExamples({
      chunks: plan.chunks,
      concurrency: 1,
      call: async ([item]) => ({
        data: {
          items: [
            { key: '1', lemma: item?.lemma, examples: item?.lemma === 'in' ? good('in') : [] },
          ],
        },
        usage,
      }),
      onChunk: (accepted, rejected) =>
        seen.push(
          ...accepted.map((a) => `+${a.lemmaKey}`),
          ...rejected.map((r) => `-${r.lemmaKey}`),
        ),
    });
    expect(seen).toEqual(['+in', '-on']);
    expect(report).toMatchObject({ chunks: 2, accepted: 1, rejected: 1, failedChunks: 0 });
    expect(report.usage).toEqual({
      inputTokens: 20,
      outputTokens: 10,
      cacheReadTokens: 4,
      cacheWriteTokens: 2,
    });
  });

  it('a failed chunk is rejected and the run goes on; a fatal error stops it', async () => {
    const plan = planExamples([source('in'), source('on')], { done: new Set(), batchSize: 1 });
    const rejected: string[] = [];
    const report = await runExamples({
      chunks: plan.chunks,
      concurrency: 1,
      call: async ([item]) => {
        if (item?.lemma === 'in') throw new LocalizationChunkError('overloaded');
        return { data: { items: [{ key: '1', lemma: 'on', examples: good('on') }] }, usage };
      },
      onChunk: (_, r) => rejected.push(...r.map((x) => `${x.lemmaKey}:${x.reasons.join()}`)),
    });
    expect(report).toMatchObject({ accepted: 1, failedChunks: 1, rejected: 1 });
    expect(rejected).toEqual(['in:overloaded']);
    await expect(
      runExamples({
        chunks: plan.chunks,
        call: async () => {
          throw new LocalizationFatalError('401');
        },
        onChunk: () => {},
      }),
    ).rejects.toThrow('401');
  });
});

describe('the examples request', () => {
  it('caches the frozen system prompt; the words go into the user message', () => {
    const plan = planExamples([source('in')], { done: new Set() });
    const req = buildExamplesRequest(plan.chunks[0] ?? [], { model: 'claude-haiku-5-5' });
    expect(req.system).toEqual([
      { type: 'text', text: EXAMPLES_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ]);
    expect(EXAMPLES_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(req.messages).toEqual([
      {
        role: 'user',
        content: expect.stringContaining(
          '"existingForm":"in","existingPlace":"middle","vary":false',
        ),
      },
    ]);
  });

  it('estimates the cost from Haiku list prices', () => {
    expect(
      estimateCostUsd({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.1 + 0.5 + 0.01 + 0.125);
  });
});
