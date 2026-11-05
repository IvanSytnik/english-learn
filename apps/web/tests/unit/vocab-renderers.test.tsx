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
      [
        'cloze',
        'collocation',
        'cued_recall',
        'definition_to_en',
        'en_to_l1',
        'full_recall',
        'l1_to_en',
      ].sort(),
    );
  });

  it('options are in the learner’s language for en_to_l1, English otherwise', () => {
    answer({ mode: 'en_to_l1', word: 'house', ipa: null, options: choiceOptions });
    expect(screen.getByText('дом')).not.toHaveAttribute('lang');
    answer({ mode: 'l1_to_en', gloss: 'дом', options: ['house', 'cat', 'table', 'window'] });
    expect(screen.getByText('house')).toHaveAttribute('lang', 'en');
    answer({
      mode: 'definition_to_en',
      definition: 'a home',
      options: ['flat', 'cat', 'tree', 'pen'],
    });
    expect(screen.getByText('flat')).toHaveAttribute('lang', 'en');
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

  it('B6.5: definition_to_en shows the English definition; collocation fills its gap once answered', () => {
    const definition: View = {
      mode: 'definition_to_en',
      definition: 'a place to live',
      options: ['house', 'cat', 'table', 'window'],
    };
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <VocabCardPrompt view={definition} card={payload(definition)} feedback={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('a place to live')).toHaveAttribute('lang', 'en');

    const phrase: View = {
      mode: 'collocation',
      phrase: 'build ___',
      options: ['a house', 'a cat', 'a table', 'a window'],
    };
    const prompt = (fb: VocabFeedback | null) =>
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <VocabCardPrompt view={phrase} card={payload(phrase)} feedback={fb} />
        </NextIntlClientProvider>,
      );
    const before = prompt(null);
    const gap = before.container.querySelector('[data-collocation]');
    expect(gap).toHaveAttribute('lang', 'en');
    expect(gap?.textContent).not.toContain('a house');
    before.unmount();
    const after = prompt(feedback);
    expect(after.container.querySelector('[data-collocation]')?.textContent).toContain('a house');
  });
});
