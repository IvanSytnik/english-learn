import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import {
  type AnswerProps,
  VOCAB_RENDERERS,
  VocabCardAnswer,
  VocabCardPrompt,
} from '@/app/[locale]/(student)/words/practice/vocab-renderers';
import type { VocabCardPayload, VocabFeedback } from '@/lib/vocab-session';
import en from '../../messages/en.json';

/**
 * The player's renderer registry (B6.3): one renderer per variant id, and
 * the details of each block the player tests do not pin — option language,
 * the cue, the input after the answer, locked options.
 */

type View = VocabCardPayload['card'];
const payload = (card: View): VocabCardPayload => ({
  vocabRef: 'ref',
  card,
  pos: 'NOUN',
  hint: null,
  canProve: false,
  isProof: false,
});
const feedback: VocabFeedback = {
  status: 'answered',
  verdict: 'correct',
  correctIndex: 0,
  chosenIndex: 0,
  word: { lemma: 'house', ipa: null, gloss: 'дом', definition: 'a home', example: null },
  proven: false,
  review: { kind: 'backInDays', days: 3 },
};

function answer(view: View, over: Partial<AnswerProps<View['mode']>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <VocabCardAnswer
        view={view}
        feedback={null}
        answered={false}
        disabled={false}
        selected={null}
        onSelect={() => {}}
        text=""
        onText={() => {}}
        inputRef={createRef()}
        {...over}
      />
    </NextIntlClientProvider>,
  );
}

const choiceOptions = ['дом', 'кот', 'стол', 'окно'];

describe('VOCAB_RENDERERS', () => {
  it('has one renderer per variant', () => {
    expect(Object.keys(VOCAB_RENDERERS).sort()).toEqual(
      ['cloze', 'cued_recall', 'en_to_l1', 'full_recall', 'l1_to_en'].sort(),
    );
  });

  it('options are in the learner’s language for en_to_l1, English otherwise', () => {
    answer({ mode: 'en_to_l1', word: 'house', ipa: null, options: choiceOptions });
    expect(screen.getByText('дом')).not.toHaveAttribute('lang');
    answer({ mode: 'l1_to_en', gloss: 'дом', options: ['house', 'cat', 'table', 'window'] });
    expect(screen.getByText('house')).toHaveAttribute('lang', 'en');
  });

  it('locks the options once the answer is in', () => {
    answer(
      { mode: 'en_to_l1', word: 'house', ipa: null, options: choiceOptions },
      {
        disabled: true,
        feedback,
      },
    );
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('cued recall shows the cue; the input goes once answered', () => {
    const view: View = { mode: 'cued_recall', gloss: 'дом', cue: 'h____' };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <VocabCardPrompt view={view} card={payload(view)} feedback={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('h____')).toBeVisible();
    const { unmount } = answer(view);
    expect(screen.getByRole('textbox')).toHaveAttribute('lang', 'en');
    unmount();
    answer(view, { answered: true });
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
