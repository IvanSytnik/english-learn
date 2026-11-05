import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { describe, expect, it } from 'vitest';
import { buildVocabCard } from '../card';
import { VOCAB_CARD_VARIANTS, VOCAB_MODES } from '../types';
import { RUNG_VARIANTS, VOCAB_LADDER, VOCAB_VARIANTS } from '../variants';
import { example, lex } from './fixtures';

const apple = lex('apple', {
  ru: 'яблоко',
  en: 'a round fruit',
  examples: [example('I ate an apple today.', 'apple')],
});
const POOL = [apple, lex('pear'), lex('bread'), lex('cheese'), lex('milk')];

/** The variant registry's contract (B6.3): one variant per mode, consistent with what it builds. */
describe('VOCAB_VARIANTS', () => {
  it('holds exactly the card variants, each under its own id', () => {
    expect(Object.keys(VOCAB_VARIANTS).sort()).toEqual([...VOCAB_CARD_VARIANTS].sort());
    for (const [id, variant] of Object.entries(VOCAB_VARIANTS)) {
      expect(variant.id).toBe(id);
      expect(variant.payloadMode).toBe(VOCAB_VARIANT_MODE[variant.id]);
    }
  });

  it('serves each rung its own card first, then its B6.5 variants — none held back', () => {
    expect(RUNG_VARIANTS).toEqual({
      en_to_l1: ['en_to_l1'],
      l1_to_en: ['l1_to_en', 'definition_to_en'],
      // collocation is held back (HELD_BACK_VARIANTS): registered, not served.
      cloze: ['cloze'],
      cued_recall: ['cued_recall'],
      full_recall: ['full_recall'],
    });
    for (const rung of VOCAB_MODES) expect(VOCAB_VARIANTS[rung].rung).toBe(rung);
  });

  it('orders the ladder by rung, starting at 0 with en_to_l1', () => {
    expect(VOCAB_LADDER.map((v) => v.id)).toEqual([
      'en_to_l1',
      'l1_to_en',
      'cloze',
      'cued_recall',
      'full_recall',
    ]);
    expect(VOCAB_LADDER[0]?.ladderFrom).toBe(0);
  });

  it('every variant builds a card of its own id and key kind', () => {
    for (const variant of VOCAB_LADDER) {
      const card = buildVocabCard({
        target: apple,
        pool: POOL,
        mode: variant.id,
        locale: 'ru',
        seed: 's',
      });
      expect(card.view.mode).toBe(variant.id);
      expect(card.key.kind).toBe(variant.keyKind);
    }
  });
});
