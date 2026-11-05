import { VOCAB_VARIANT_MODE } from '@englishlearn/db/schemas';
import { recallCue } from '../text';
import { gradeText, promptGloss, recallKey } from './shared';
import type { VocabRungVariant } from './types';

/** Mode 4 (21 ≤ S < 60), also the "Know → prove" check: the meaning and a first-letter cue, type the word. */
export const cuedRecall: VocabRungVariant<'cued_recall'> = {
  id: 'cued_recall',
  rung: 'cued_recall',
  payloadMode: VOCAB_VARIANT_MODE.cued_recall,
  ladderFrom: 21,
  keyKind: 'text',
  eligible: () => true,
  build({ target, pool, locale }) {
    return {
      view: {
        mode: 'cued_recall',
        gloss: promptGloss(target, locale),
        cue: recallCue(target.lemma),
      },
      key: { kind: 'text', mode: 'cued_recall', ...recallKey(target, pool, locale) },
    };
  },
  grade: gradeText,
};
