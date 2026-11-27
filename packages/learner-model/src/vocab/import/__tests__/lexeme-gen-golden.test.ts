import { readFileSync } from 'node:fs';
import { loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { slugIndex } from '@englishlearn/db/vocab/slug';
import { describe, expect, it } from 'vitest';
import { normalizeTerm } from '../forms';
import { isGenerationCandidateAllowed } from '../generation-gate';
import { buildCatalogueIndex, isCatalogueTerm } from '../match';

/**
 * The lexeme generation eval's golden set (`packages/ai/evals/lexeme-gen`,
 * B6.9) holds only what can reach the LLM in B6.10: every input is already
 * normalized, passes the pre-LLM gate and is no catalogue word or form (a
 * catalogue match never becomes a generation request). Lives here because
 * the gate and the catalogue index do.
 */

const golden = JSON.parse(
  readFileSync(new URL('../../../../../ai/evals/lexeme-gen/golden.json', import.meta.url), 'utf8'),
) as { cases: { input: string; category: string }[] };

const { lexemes } = loadCefrJDataset();
const INDEX = buildCatalogueIndex(
  [...slugIndex(lexemes).bySlug].map(([slug, l]) => ({
    slug,
    lemma: l.lemma,
    lemmaKey: l.lemmaKey,
    pos: l.pos,
    sense: l.sense,
    variants: l.variants,
    frequencyRank: null,
  })),
);

describe('lexeme-gen golden set', () => {
  it('has about 60 cases with unique inputs', () => {
    expect(golden.cases.length).toBeGreaterThanOrEqual(55);
    expect(new Set(golden.cases.map((c) => c.input)).size).toBe(golden.cases.length);
  });

  it.each(
    golden.cases.map((c) => [c.input, c.category]),
  )('%s (%s) is normalized, passes the gate and is not in the catalogue', (input) => {
    expect(normalizeTerm(input)).toBe(input);
    expect(isGenerationCandidateAllowed(input, { index: INDEX })).toEqual({ ok: true });
    expect(isCatalogueTerm(INDEX, input)).toBe(false);
  });
});
