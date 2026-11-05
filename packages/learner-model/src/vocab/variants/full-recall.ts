import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { gradeText, promptGloss, recallKey } from './shared';
import type { VocabRungVariant } from './types';

/** Mode 5 (S ≥ 60): the meaning, type the word. */
export const fullRecall: VocabRungVariant<'full_recall'> = {
  id: 'full_recall',
  rung: 'full_recall',
  payloadMode: VOCAB_VARIANT_MODE.full_recall,
  ladderFrom: 60,
  keyKind: 'text',
  eligible: () => true,
  build({ target, pool, locale }) {
    return {
      view: { mode: 'full_recall', gloss: promptGloss(target, locale) },
      key: { kind: 'text', mode: 'full_recall', ...recallKey(target, pool, locale) },
    };
  },
  grade: gradeText,
};
