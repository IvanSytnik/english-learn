import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { lexemeIdentity, loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { loadLocalizationSnapshot } from '@englishlearn/db/vocab/localization-snapshot';
import { vocabConceptId } from '@englishlearn/db/vocab/topics';
import { describe, expect, it } from 'vitest';
import { buildVocabCard, type VocabCard } from '../card';
import { gradeVocabAnswer, type VocabAnswer } from '../grade';
import { vocabModeFor } from '../ladder';
import { VOCAB_MODES, type VocabLexeme, type VocabLocale } from '../types';

/**
 * B6.3 proof of no behaviour change: cards for 200 real lexemes × 5 modes ×
 * 4 locales with fixed seeds, the grade of five answers on each, and the
 * ladder over a stability grid — hashed per (mode, locale) and compared with
 * the snapshot generated on the commit before the variant registry. Byte
 * equality of the canonical JSON; on a mismatch the first differing card is
 * named. Regenerate only on purpose: `UPDATE_CARD_SNAPSHOT=1`.
 */

const SNAPSHOT = new URL('./__snapshots__/card-output.json', import.meta.url);

const dataset = new Map(loadCefrJDataset().lexemes.map((l) => [lexemeIdentity(l), l]));
const POOL: VocabLexeme[] = loadLocalizationSnapshot().entries.map((e, i) => {
  const entry = dataset.get(lexemeIdentity(e));
  if (!entry) throw new Error(`${e.lemmaKey} is not in the dataset`);
  return {
    id: `lx${String(i).padStart(5, '0')}`,
    lemma: entry.lemma,
    lemmaKey: e.lemmaKey,
    pos: entry.pos,
    cefrLevel: e.cefrLevel,
    conceptId: vocabConceptId(entry.topic, e.cefrLevel),
    definitions: e.definitions,
    translations: e.translations,
    examples: e.examples,
    variants: entry.variants,
  };
});
const STRIDE = Math.floor(POOL.length / 200);
const SAMPLE = Array.from({ length: 200 }, (_, i) => POOL[i * STRIDE] as VocabLexeme);
const LOCALES: VocabLocale[] = ['ru', 'uk', 'de', 'en'];

function answersFor(card: VocabCard, target: VocabLexeme): VocabAnswer[] {
  const fixed: VocabAnswer[] = [{ kind: 'dont_know' }, { kind: 'text', text: target.lemma }];
  return card.key.kind === 'choice'
    ? [
        ...fixed,
        { kind: 'choice', index: card.key.correctIndex },
        { kind: 'choice', index: 3 - card.key.correctIndex },
        { kind: 'choice', index: 7 },
      ]
    : [
        ...fixed,
        { kind: 'text', text: ` ${target.lemma.toUpperCase()} ` },
        { kind: 'text', text: 'zzz' },
        { kind: 'choice', index: 0 },
      ];
}

function outputs(): Record<string, { count: number; sha256: string; cards: string[] }> {
  const out: Record<string, { count: number; sha256: string; cards: string[] }> = {};
  for (const mode of VOCAB_MODES) {
    for (const locale of LOCALES) {
      const cards = SAMPLE.map((target) => {
        const card = buildVocabCard({
          target,
          pool: POOL,
          mode,
          locale,
          seed: `snap:${target.id}`,
        });
        const grades = answersFor(card, target).map((a) => gradeVocabAnswer(card.key, a));
        return JSON.stringify({ id: target.id, card, grades });
      });
      out[`${mode}/${locale}`] = {
        count: cards.length,
        sha256: createHash('sha256').update(cards.join('\n')).digest('hex'),
        cards,
      };
    }
  }
  const ladder = [];
  for (const cardStatus of ['NEW', 'LEARNING', 'REVIEW', 'RELEARNING'] as const) {
    for (const stability of [0, 0.5, 1.99, 2, 6.99, 7, 20.99, 21, 59.99, 60, 400]) {
      ladder.push(JSON.stringify([cardStatus, stability, vocabModeFor({ cardStatus, stability })]));
    }
  }
  ladder.push(JSON.stringify([null, vocabModeFor(null)]));
  out.ladder = {
    count: ladder.length,
    sha256: createHash('sha256').update(ladder.join('\n')).digest('hex'),
    cards: ladder,
  };
  return out;
}

describe('vocabulary card output is pinned (B6.3)', () => {
  it('matches the pre-registry snapshot byte for byte', () => {
    const now = outputs();
    if (process.env.UPDATE_CARD_SNAPSHOT === '1' || !existsSync(SNAPSHOT)) {
      const hashes = Object.fromEntries(
        Object.entries(now).map(([k, v]) => [k, { count: v.count, sha256: v.sha256 }]),
      );
      writeFileSync(SNAPSHOT, `${JSON.stringify(hashes, null, 2)}\n`);
      if (process.env.CI) throw new Error('card snapshot missing in CI');
      return;
    }
    const pinned = JSON.parse(readFileSync(SNAPSHOT, 'utf8')) as Record<
      string,
      { count: number; sha256: string }
    >;
    expect(Object.keys(now)).toEqual(Object.keys(pinned));
    for (const [key, { count, sha256, cards }] of Object.entries(now)) {
      const want = pinned[key];
      expect(count, key).toBe(want?.count);
      if (sha256 !== want?.sha256) {
        throw new Error(`${key}: output changed (first card ${cards[0]?.slice(0, 200)} …)`);
      }
    }
  });
});
