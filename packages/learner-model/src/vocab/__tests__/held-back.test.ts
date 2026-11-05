import { lexemeIdentity, loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { loadExamplesSnapshot } from '@englishlearn/db/vocab/examples-snapshot';
import { loadLocalizationSnapshot } from '@englishlearn/db/vocab/localization-snapshot';
import { vocabConceptId } from '@englishlearn/db/vocab/topics';
import { describe, expect, it } from 'vitest';
import type { CEFRLevel } from '../../core/graph/types';
import { buildVocabCard } from '../card';
import type { VocabLexeme } from '../types';
import { collocation } from '../variants/collocation';

/**
 * A held-back variant is never served (B6.5a): `collocation` stays in the
 * registry but off the cloze rung until its distractors are verified. Checked
 * on the real pool — the committed localization (with its collocations) plus
 * the B6.4a examples, joined the way vocab:publish and vocab:sync-examples
 * write them — for every learner level, so a word where the collocation
 * would fit is among the cases.
 */

const dataset = new Map(loadCefrJDataset().lexemes.map((l) => [lexemeIdentity(l), l]));
const generated = new Map(
  loadExamplesSnapshot().entries.map((e) => [lexemeIdentity(e), e.examples]),
);
const POOL: VocabLexeme[] = loadLocalizationSnapshot().entries.map((e, i) => {
  const entry = dataset.get(lexemeIdentity(e));
  if (!entry) throw new Error(`${e.lemmaKey} is not in the dataset`);
  const seen = new Set(e.examples.map((ex) => ex.sentence));
  const added = (generated.get(lexemeIdentity(e)) ?? []).filter((ex) => !seen.has(ex.sentence));
  return {
    id: `lx${String(i).padStart(5, '0')}`,
    lemma: entry.lemma,
    lemmaKey: e.lemmaKey,
    pos: entry.pos,
    cefrLevel: e.cefrLevel,
    conceptId: vocabConceptId(entry.topic, e.cefrLevel),
    definitions: e.definitions,
    translations: e.translations,
    examples: [...e.examples, ...added],
    variants: entry.variants,
    collocations: e.collocations,
  };
});
const LEVELS: readonly (CEFRLevel | null)[] = [null, 'A1', 'A2', 'B1', 'B2', 'C1'];

describe('held-back variants (B6.5a)', () => {
  it('the cloze rung never emits collocation, for any learner level, on the real pool', {
    timeout: 120_000,
  }, () => {
    expect(POOL).toHaveLength(4944);
    let wouldFit = 0;
    const emitted: string[] = [];
    POOL.forEach((target, i) => {
      // One level per word, every level across the pool (each ~824 words).
      const learnerLevel = LEVELS[i % LEVELS.length] ?? null;
      const seed = `held:${target.id}`;
      const ctx = { pool: POOL, locale: 'ru' as const, seed, learnerLevel };
      if (collocation.eligible(target, ctx)) wouldFit++;
      const { view } = buildVocabCard({ target, mode: 'cloze', ...ctx });
      if (view.mode === 'collocation') emitted.push(`${target.lemma} ${learnerLevel}`);
    });
    expect(emitted).toEqual([]);
    // Not vacuous: the collocation fits a B1+ word in most of these cases.
    expect(wouldFit).toBeGreaterThan(1000);
  });
});
