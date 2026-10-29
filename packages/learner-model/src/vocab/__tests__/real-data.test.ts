import { lexemeIdentity, loadCefrJDataset } from '@englishlearn/db/vocab/dataset';
import { loadLocalizationSnapshot } from '@englishlearn/db/vocab/localization-snapshot';
import { vocabConceptId } from '@englishlearn/db/vocab/topics';
import { describe, expect, it } from 'vitest';
import { buildVocabCard } from '../card';
import { gradeVocabAnswer } from '../grade';
import { VOCAB_MODES, type VocabLexeme, type VocabLocale } from '../types';

/**
 * The engine on the committed vocabulary — the 4944 CEFR-J words with their
 * validated localization, joined the way vocab:publish joins them (topic and
 * variants from the dataset). Every sampled word must yield a well-formed
 * card in every mode and language: four distinct options with the answer
 * among them, no answer text in a recall or cloze prompt, the typed answer
 * graded CORRECT. A sample keeps it fast; the stride covers all topics,
 * levels and POS.
 */

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
const LOCALES: VocabLocale[] = ['ru', 'uk', 'de', 'en'];

const wholeWord = (word: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
    'iu',
  );

describe('vocabulary cards on the real word list', () => {
  it('has the whole published vocabulary', () => {
    expect(POOL).toHaveLength(4944);
  });

  it.each(LOCALES)('every mode yields a well-formed card (%s)', { timeout: 60_000 }, (locale) => {
    const stride = locale === 'ru' ? 7 : 31;
    const sample = POOL.filter((_, i) => i % stride === 0);
    for (const target of sample) {
      for (const mode of VOCAB_MODES) {
        const { view, key } = buildVocabCard({ target, pool: POOL, mode, locale, seed: target.id });
        const label = `${target.lemma} ${mode} ${locale}`;
        if (key.kind === 'choice') {
          if (!('options' in view)) throw new Error(label);
          expect(new Set(view.options).size, label).toBe(4);
          expect(gradeVocabAnswer(key, { kind: 'choice', index: key.correctIndex }), label).toBe(
            'CORRECT',
          );
        } else {
          expect(gradeVocabAnswer(key, { kind: 'text', text: target.lemma }), label).toBe(
            'CORRECT',
          );
          expect(JSON.stringify(view), label).not.toMatch(wholeWord(target.lemma));
        }
        if (view.mode === 'cloze') {
          const surface = target.examples[0]?.clozeTarget ?? '';
          expect(view.sentence, label).not.toMatch(wholeWord(surface));
        }
      }
    }
  });
});
